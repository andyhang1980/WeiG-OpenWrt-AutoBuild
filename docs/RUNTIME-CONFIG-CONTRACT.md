# Runtime configuration and build execution

Catalog owns native Profile baselines, typed Kconfig relations and package metadata. The browser evaluates those facts, offers minimal legal recommendations and lets the user explicitly retain a risky configuration. The firmware Worker obtains the pinned inputs, reconstructs baseline plus overrides and executes the build. It must not reject software selections through a second dependency or compatibility review. Request parsing, input identity, execution safety and exact override fidelity are separate from software compatibility.

Derived values are not user assignments. A dependency shutdown may lower a derived boolean or omit a derived scalar without losing its provenance. When that dependency becomes active again, the same shared evaluator recomputes applicable defaults. Explicit user assignments survive dependency transitions; historical requests without intent provenance are never silently reinterpreted.

Package dependency availability and installation semantics are distinct from Kconfig visibility. Complete native metadata can prove that a required provider is absent; legacy/incomplete metadata must remain inconclusive. APK versioned/exclusive provides and unversioned capabilities must retain their native distinction. OPKG must not inherit APK-only constraints. File ownership conflicts not declared by upstream belong in scoped, evidence-backed compatibility rules, not package-specific browser code.

Ordinary interactive edits use the shared evaluator's `menuconfig` scope: defaults/select/imply, dependency ceilings, visibility and choices remain native; package installation metadata does not provision extra values, preserve an obsolete conditional select, or block the edit. Missing providers, installation conflicts and compatibility facts remain available to explicit Check/Submit preflight. Native selectability is not a promise that a firmware build will succeed.

The first successful edit on an imported/new model revision uses full native resolution. Subsequent edits reuse the existing structural default worklist for the affected Kconfig closure, never cached effective defaults. Imports, model replacement and non-intent revisions invalidate that settled marker; module-mode transitions fall back to full resolution. Tests compare dirty and full native results over identical inputs.

Dependency assistance is opt-in from a separate card button and appears below the current group, not as a forced prerequisite modal. It distinguishes manual prerequisite steps from automatic Kconfig linkage, uses the existing bounded planner and offers Apply only for a unique legal plan without unresolved installation dependencies. Target/hidden switches are not automatically changed. A changed revision requires explicit refresh. Ordinary clicks neither invoke this planner nor scan compatibility.

Compatibility facts are scoped to their actual Source, Branch, source commit, feeds identity and Target. A failed Worker review is not evidence of an upstream compilation failure. Upstream patch and download failures must not be reported as a configuration rewrite or a package-pair conflict.

Shared tooltips use natural content width up to two thirds of the visual viewport, wrapping longer content within safe bounds. They reuse the viewport/obstruction positioning engine and must not require horizontal scrolling.

Regression coverage includes dependency/default cycles for all five Kconfig types, explicit exclusions, historical import/export, provider installation semantics, complete versus incomplete missing dependencies, scoped installed-package conflicts, Worker execution without software review, and long tooltips at narrow/wide/zoomed viewports.
