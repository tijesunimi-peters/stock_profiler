"""Pure tests for `sec/exhibits.py` -- no network.

This module is the one place the codebase parses a filing document, by explicit operator ruling.
An exception needs a tighter guard than the rule it replaces, so most of these tests are about what
the parser REFUSES to do: a partial subsidiary list is worse than none, because a reader cannot
tell a short list from a badly-parsed one.
"""

from __future__ import annotations

from secfin.sec.exhibits import find_ex21_filename, parse_ex21


class TestFindEx21Filename:
    def test_reads_the_ESCAPED_sgml_headers(self):
        """The detail that makes a naive `<TYPE>` search find nothing.

        EDGAR's `-index-headers.html` escapes the SGML, so the page contains `&lt;TYPE&gt;EX-21.1`
        rather than `<TYPE>EX-21.1`. Verified against Apple's FY2025 10-K, 2026-08-02.
        """
        page = (
            "<html><body>&lt;DOCUMENT&gt; &lt;TYPE&gt;EX-4.1 &lt;FILENAME&gt;ex4.htm "
            "&lt;DOCUMENT&gt; &lt;TYPE&gt;EX-21.1 &lt;SEQUENCE&gt;3 "
            "&lt;FILENAME&gt;a10-kexhibit21109272025.htm</body></html>"
        )
        assert find_ex21_filename(page) == "a10-kexhibit21109272025.htm"

    def test_matches_the_variants_in_the_wild(self):
        for t in ("EX-21", "EX-21.1", "EX-21.01"):
            page = f"&lt;TYPE&gt;{t} &lt;FILENAME&gt;x.htm"
            assert find_ex21_filename(page) == "x.htm"

    def test_no_ex21_is_an_absence_not_a_failure(self):
        """A 10-Q carries none, and a registrant with no subsidiaries need not file one."""
        assert find_ex21_filename("&lt;TYPE&gt;EX-31.1 &lt;FILENAME&gt;ex31.htm") is None


class TestParseEx21:
    def _table(self, rows: list[tuple[str, ...]], header=("Name", "Jurisdiction of Incorporation")):
        cells = "".join(
            "<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in [header, *rows]
        )
        return f"<html><body><table>{cells}</table></body></html>"

    def test_reads_names_and_jurisdictions(self):
        r = parse_ex21(self._table([("Apple Canada Inc.", "Canada"), ("iTunes K.K.", "Japan")]))
        assert r.status == "ok"
        assert [(s.name, s.jurisdiction) for s in r.subsidiaries] == [
            ("Apple Canada Inc.", "Canada"),
            ("iTunes K.K.", "Japan"),
        ]

    def test_footnote_markers_are_stripped_but_PUNCTUATION_IS_NOT(self):
        """The bug this test exists for.

        An early version stripped "." along with "*", turning "Apple Canada Inc." into "Apple
        Canada Inc" and "Delaware, U.S." into "Delaware, U.S". Those are legal entity names on a
        card about corporate structure — quietly rewriting them is worse than not showing them.
        """
        r = parse_ex21(self._table([("Braeburn Capital, Inc.*", "Nevada, U.S.\xa0")]))
        assert r.subsidiaries[0].name == "Braeburn Capital, Inc."
        assert r.subsidiaries[0].jurisdiction == "Nevada, U.S."

    def test_ownership_is_read_only_when_the_filer_published_it(self):
        r = parse_ex21(
            self._table([("Sub A", "Delaware", "100%")], header=("Name", "Jurisdiction", "Ownership"))
        )
        assert r.has_ownership is True
        assert r.subsidiaries[0].ownership == "100%"

    def test_absent_ownership_is_NOT_reported_as_wholly_owned(self):
        """A blank column is not 100%. Most filers publish no ownership at all."""
        r = parse_ex21(self._table([("Sub A", "Delaware")]))
        assert r.has_ownership is False
        assert r.subsidiaries[0].ownership is None

    def test_a_prose_exhibit_is_NA_not_a_guess(self):
        doc = "<html><body><p>Subsidiaries: Alpha Ltd (UK), Beta GmbH (Germany).</p></body></html>"
        r = parse_ex21(doc)
        assert r.status == "na"
        assert r.subsidiaries == []
        assert "prose" in (r.reason or "")

    def test_a_one_row_table_is_NA_rather_than_a_one_entry_list(self):
        """Too thin to distinguish a real single-subsidiary filer from a mis-parse."""
        assert parse_ex21(self._table([])).status == "na"

    def test_malformed_html_does_not_raise(self):
        r = parse_ex21("<html><table><tr><td>Broken")
        assert r.status == "na"

    def test_the_caveat_travels_with_the_list(self):
        """EX-21 omits immaterial subsidiaries, so the list is a floor and must say so."""
        r = parse_ex21(self._table([("A Ltd", "UK"), ("B Ltd", "UK")]))
        assert "floor" in r.cannot and "immaterial" in r.cannot


class TestOwnershipUnits:
    """Exxon publishes ownership as a bare number with the unit in the column header.

    Surveyed 2026-08-02: of eleven filers whose EX-21 parsed, only Walmart ("100%") and Exxon
    ("50", "69.6") published ownership at all. Exxon's header reads "Percentage of Voting
    Securities Owned Directly or Indirectly by Registrant".
    """

    def _doc(self, header, row):
        cells = "".join(
            "<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in (header, row)
        )
        return f"<table>{cells}</table>"

    def test_a_bare_number_gains_the_percent_its_header_states(self):
        r = parse_ex21(self._doc(
            ("Name", "Percentage of Voting Securities Owned", "State or Country of Organization"),
            ("Imperial Oil Limited", "69.6", "Canada"),
        ))
        assert r.subsidiaries[0].ownership == "69.6%"

    def test_a_value_that_already_has_its_unit_is_left_alone(self):
        r = parse_ex21(self._doc(
            ("Name", "Percent owned", "Jurisdiction"), ("Sub", "100%", "Delaware"),
        ))
        assert r.subsidiaries[0].ownership == "100%"

    def test_only_a_percentage_header_licenses_the_percent_sign(self):
        """Recognised as ownership, but the header never says percent — so nothing is added.

        Guessing the unit would be inventing it, and "500%" owned is a nonsense a reader would
        have to catch for us.
        """
        r = parse_ex21(self._doc(
            ("Name", "Ownership", "Jurisdiction"), ("Sub", "500", "Delaware"),
        ))
        assert r.subsidiaries[0].ownership == "500"

    def test_an_unrecognised_column_is_not_read_as_ownership_at_all(self):
        """"Shares held" is not an ownership stake, and the parser does not treat it as one."""
        r = parse_ex21(self._doc(
            ("Name", "Shares held", "Jurisdiction"), ("Sub", "500", "Delaware"),
        ))
        assert r.has_ownership is False
        assert r.subsidiaries[0].ownership is None


class TestProseExhibitsStayUnread:
    def test_targets_prose_exhibit_is_na_not_a_guess(self):
        """Target files EX-21 as running prose — "Target Brands, Inc. (MN) Target Enterprise..."

        One filer in twelve does this. The pattern looks extractable, and that is exactly why it is
        left alone: a list guessed out of prose is indistinguishable, to a reader, from one read
        off a table.
        """
        doc = ("<html><body><p>List of Significant Subsidiaries (As of January 31, 2026) "
               "Target Brands, Inc. (MN) Target Enterprise, Inc. (MN)</p></body></html>")
        r = parse_ex21(doc)
        assert r.status == "na" and r.subsidiaries == []
