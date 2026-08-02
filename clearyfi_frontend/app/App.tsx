/**
 * Route table. Split by altitude (RECONCILIATION §2, resolution 3) — the routes that already
 * ship keep their shape, and selection rides across them in the query string.
 */
import { useEffect } from "react";
import { navigate, useRoute } from "./router";
import { useSelection } from "./state";
import { useAnchorRouting } from "./ui/Shell";
import { SectorPage } from "./pages/sectors/SectorPage";
import { CompanyPage } from "./pages/company/CompanyPage";
import { ManagerPage } from "./pages/manager/ManagerPage";
import { ComparePage } from "./pages/compare/ComparePage";
import { PlannedPage } from "./pages/PlannedPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function App() {
  const route = useRoute();
  const sel = useSelection();
  const onClick = useAnchorRouting();

  // `/` is not a surface — the landing altitude is the sector view (01).
  useEffect(() => {
    if (route.subject === "home") navigate(sel.href("/sectors"), { replace: true });
  }, [route.subject, sel]);

  return (
    <div className="cf-root" onClick={onClick}>
      {route.subject === "sectors" && <SectorPage view={route.view} />}
      {route.subject === "company" && <CompanyPage symbol={route.entity!} view={route.view} />}
      {route.subject === "manager" && <ManagerPage cik={Number(route.entity)} view={route.view} />}
      {route.subject === "compare" && <ComparePage view={route.view as "sectors" | "companies"} />}
      {route.subject === "planned" && <PlannedPage name={route.planned!} />}
      {route.subject === "notFound" && <NotFoundPage />}
      {route.subject === "home" && null}
    </div>
  );
}
