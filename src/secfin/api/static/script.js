(function () {
  const toggle = document.getElementById("navToggle");
  const mobileNav = document.getElementById("navMobile");
  if (!toggle || !mobileNav) return;

  toggle.addEventListener("click", function () {
    const isOpen = mobileNav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  mobileNav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      mobileNav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
})();
