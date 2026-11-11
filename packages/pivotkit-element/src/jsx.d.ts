// Opt-in JSX types for React: `import type {} from "pivotkit-element/jsx";` once in a React app
// makes <pivot-report> a known element with its properties and its events as `on<event-name>` props.
// They describe React 19, which sets a prop as a property when the element has one and listens for a
// custom event through `on` + its exact name (react.dev, "Custom HTML elements"). React 18 passes
// every prop as an attribute and has no custom event props: set objects and listeners in a ref there.
// Copied next to the generated declarations by types.js; needs @types/react 18.3 or later.
import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { PivotReportElement } from "./element.js";
import type { PivotReportEventMap } from "./global.js";

type Settable = "data" | "dataKey" | "view" | "defaultView" | "templates" | "labels" | "fieldDefaults" | "limits" | "locale" | "theme" | "height" | "timeZone" | "fileName" | "label" | "drillDown" | "drillDownLimit" | "saveTemplates" | "templateStore" | "canPublish" | "tips" | "storageKey" | "dismissedTips" | "chartOptions" | "shareLink" | "persistView" | "loading" | "fieldInfo" | "zoneInfo" | "settingInfo" | "sourceId" | "sourceName" | "sources" | "schemaUrl" | "grow" | "fieldList" | "allowImport" | "plugins";

/** The props of <pivot-report> in JSX. */
export type PivotReportJsxProps = DetailedHTMLProps<HTMLAttributes<PivotReportElement>, PivotReportElement> &
    Partial<Pick<PivotReportElement, Settable>> & {
        [K in keyof PivotReportEventMap as `on${K}`]?: (event: PivotReportEventMap[K]) => void;
    };

declare module "react" {
    namespace JSX {
        interface IntrinsicElements {
            "pivot-report": PivotReportJsxProps;
        }
    }
}
