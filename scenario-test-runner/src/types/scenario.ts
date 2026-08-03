import type { Page } from "playwright";
import { TestAction } from "../constants/test-action.js";

export type AriaRole = Parameters<Page["getByRole"]>[0];

export const ARIA_ROLES = [
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "deletion",
  "dialog",
  "directory",
  "document",
  "emphasis",
  "feed",
  "figure",
  "form",
  "generic",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "insertion",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "marquee",
  "math",
  "meter",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "navigation",
  "none",
  "note",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "subscript",
  "superscript",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "time",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem"
] as const satisfies readonly AriaRole[];

interface BaseElementTarget {
  value: string;
  exact?: boolean;
}

export interface TestIdTarget extends BaseElementTarget {
  strategy: "testId";
}

export interface RoleTarget extends BaseElementTarget {
  strategy: "role";
  value: AriaRole;
  name?: string;
}

export interface LabelTarget extends BaseElementTarget {
  strategy: "label";
}

export interface PlaceholderTarget extends BaseElementTarget {
  strategy: "placeholder";
}

export interface TextTarget extends BaseElementTarget {
  strategy: "text";
}

export interface CssTarget extends BaseElementTarget {
  strategy: "css";
}

export type ElementTarget =
  | TestIdTarget
  | RoleTarget
  | LabelTarget
  | PlaceholderTarget
  | TextTarget
  | CssTarget;

export interface UrlExpectation {
  operator: "exact" | "contains";
  value: string;
}

interface BaseTestStep {
  id: string;
  order: number;
  name: string;
  action: TestAction;
  timeout?: number;
  required: boolean;
}

export interface GotoTestStep extends BaseTestStep {
  action: TestAction.GOTO;
  value: string;
}

export interface FillTestStep extends BaseTestStep {
  action: TestAction.FILL;
  target: ElementTarget;
  value: string;
  sensitive?: boolean;
}

export interface ClickTestStep extends BaseTestStep {
  action: TestAction.CLICK;
  target: ElementTarget;
}

export interface AssertUrlTestStep extends BaseTestStep {
  action: TestAction.ASSERT_URL;
  expected: UrlExpectation;
}

export interface AssertVisibleTestStep extends BaseTestStep {
  action: TestAction.ASSERT_VISIBLE;
  target: ElementTarget;
}

export type TestStep =
  | GotoTestStep
  | FillTestStep
  | ClickTestStep
  | AssertUrlTestStep
  | AssertVisibleTestStep;

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  startUrl: string;
  stopOnFailure: boolean;
  timeout: number;
  steps: TestStep[];
}
