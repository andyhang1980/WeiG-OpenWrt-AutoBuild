# Runtime configuration and build execution

Catalog owns native Profile baselines, typed Kconfig relations and package metadata. The browser evaluates those facts, offers minimal legal recommendations and lets the user explicitly retain a risky configuration. The firmware Worker obtains the pinned inputs, reconstructs baseline plus overrides and executes the build. It must not reject software selections through a second dependency or compatibility review. Request parsing, input identity, execution safety and exact override fidelity are separate from software compatibility.

Derived values are not user assignments. A dependency shutdown may lower a derived boolean or omit a derived scalar without losing its provenance. When that dependency becomes active again, the same shared evaluator recomputes applicable defaults. Explicit user assignments survive dependency transitions; historical requests without intent provenance are never silently reinterpreted.

Package dependency availability and installation semantics are distinct from Kconfig visibility. Complete native metadata can prove that a required provider is absent; legacy/incomplete metadata must remain inconclusive. APK versioned/exclusive provides and unversioned capabilities must retain their native distinction. OPKG must not inherit APK-only constraints. File ownership conflicts not declared by upstream belong in scoped, evidence-backed compatibility rules, not package-specific browser code.

Compatibility facts are scoped to their actual Source, Branch, source commit, feeds identity and Target. A failed Worker review is not evidence of an upstream compilation failure. Upstream patch and download failures must not be reported as a configuration rewrite or a package-pair conflict.

Shared tooltips use natural content width up to two thirds of the visual viewport, wrapping longer content within safe bounds. They reuse the viewport/obstruction positioning engine and must not require horizontal scrolling.

Regression coverage includes dependency/default cycles for all five Kconfig types, explicit exclusions, historical import/export, provider installation semantics, complete versus incomplete missing dependencies, scoped installed-package conflicts, Worker execution without software review, and long tooltips at narrow/wide/zoomed viewports.
