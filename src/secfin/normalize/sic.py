"""SIC major-group (2-digit) reference labels.

Static, public-domain classification data -- the standard SIC *major group* titles, keyed by the
2-digit prefix that `analytical/peer_ranks.py` / `analytical/sector_dupont.py` group companies by.
Like `geography.py`'s state table, this is a fixed lookup, NOT ingested data: it turns an opaque
group code (e.g. "35") into a readable label ("Industrial & Commercial Machinery & Computer
Equipment") for the sector overview. An unknown code falls back to the bare code -- honest, never
fabricated.
"""

from __future__ import annotations

# Official SIC 2-digit major-group titles. Source: the SIC manual's division/major-group
# structure (public domain). Kept lightly abbreviated for UI legibility.
SIC2_MAJOR_GROUP_NAMES: dict[str, str] = {
    "01": "Agricultural Production - Crops",
    "02": "Agricultural Production - Livestock",
    "07": "Agricultural Services",
    "08": "Forestry",
    "09": "Fishing, Hunting & Trapping",
    "10": "Metal Mining",
    "12": "Coal Mining",
    "13": "Oil & Gas Extraction",
    "14": "Nonmetallic Minerals Mining",
    "15": "Building Construction - General Contractors",
    "16": "Heavy Construction (non-building)",
    "17": "Construction - Special Trade Contractors",
    "20": "Food & Kindred Products",
    "21": "Tobacco Products",
    "22": "Textile Mill Products",
    "23": "Apparel & Finished Fabric Products",
    "24": "Lumber & Wood Products",
    "25": "Furniture & Fixtures",
    "26": "Paper & Allied Products",
    "27": "Printing, Publishing & Allied",
    "28": "Chemicals & Allied Products",
    "29": "Petroleum Refining & Related",
    "30": "Rubber & Plastics Products",
    "31": "Leather & Leather Products",
    "32": "Stone, Clay, Glass & Concrete",
    "33": "Primary Metal Industries",
    "34": "Fabricated Metal Products",
    "35": "Industrial & Commercial Machinery & Computer Equipment",
    "36": "Electronic & Other Electrical Equipment",
    "37": "Transportation Equipment",
    "38": "Measuring & Analyzing Instruments",
    "39": "Miscellaneous Manufacturing",
    "40": "Railroad Transportation",
    "41": "Local & Suburban Transit",
    "42": "Motor Freight Transportation & Warehousing",
    "43": "U.S. Postal Service",
    "44": "Water Transportation",
    "45": "Air Transportation",
    "46": "Pipelines, Except Natural Gas",
    "47": "Transportation Services",
    "48": "Communications",
    "49": "Electric, Gas & Sanitary Services",
    "50": "Wholesale Trade - Durable Goods",
    "51": "Wholesale Trade - Nondurable Goods",
    "52": "Building Materials & Garden Supplies",
    "53": "General Merchandise Stores",
    "54": "Food Stores",
    "55": "Automotive Dealers & Service Stations",
    "56": "Apparel & Accessory Stores",
    "57": "Home Furniture & Furnishings Stores",
    "58": "Eating & Drinking Places",
    "59": "Miscellaneous Retail",
    "60": "Depository Institutions",
    "61": "Non-depository Credit Institutions",
    "62": "Security & Commodity Brokers",
    "63": "Insurance Carriers",
    "64": "Insurance Agents, Brokers & Service",
    "65": "Real Estate",
    "67": "Holding & Other Investment Offices",
    "70": "Hotels & Lodging",
    "72": "Personal Services",
    "73": "Business Services",
    "75": "Automotive Repair & Services",
    "76": "Miscellaneous Repair Services",
    "78": "Motion Pictures",
    "79": "Amusement & Recreation Services",
    "80": "Health Services",
    "81": "Legal Services",
    "82": "Educational Services",
    "83": "Social Services",
    "84": "Museums & Botanical/Zoological Gardens",
    "86": "Membership Organizations",
    "87": "Engineering, Accounting & Management Services",
    "88": "Private Households",
    "89": "Miscellaneous Services",
    "91": "Executive, Legislative & General Government",
    "92": "Justice, Public Order & Safety",
    "93": "Public Finance & Taxation",
    "94": "Administration of Human Resources",
    "95": "Environmental Quality & Housing",
    "96": "Administration of Economic Programs",
    "97": "National Security & International Affairs",
    "99": "Nonclassifiable Establishments",
}


def sic2_label(code: str) -> str:
    """Readable major-group name for a 2-digit SIC prefix, or the bare code if unknown."""
    return SIC2_MAJOR_GROUP_NAMES.get(code, code)
