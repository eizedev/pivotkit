// Every form field of a report has a name of its own report and a label (#115): the field list, every
// level of the chip menus, Options, Views and Export, and the filter from the field list; two reports
// on one page share no name (pivotkit-react in one React root, and two web components, each a root
// of its own).
import { expect, test } from "./fixtures.js";
import { NAV_PAGES, everyTopic, formFields, openZonesIn, toolbarIn } from "./host-nav.js";

test.describe("form fields have names of their own per report (#115)", () => {
    for (const [name, url] of NAV_PAGES) {
        test(`${name}: every input, select and textarea of the field list and the menus has a name and a label; two reports share none`, async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.goto(`${url}?two`);
            const names = {};
            for (const id of ["one", "two"]) {
                const report = page.locator(`#${id}`);
                const seen = [];
                await expect(report.locator(".pk-field")).toHaveCount(9);
                await openZonesIn(report);
                seen.push(...(await formFields(report)));
                await everyTopic(page, report, () => report.getByTestId("chip-menu-Environment").click(), seen);
                await everyTopic(page, report, () => report.getByTestId("chip-menu-Sum of Cost").click(), seen);
                for (const menu of ["options", "views", "export"]) {
                    await everyTopic(page, report, () => toolbarIn(report, menu), seen);
                }
                // the filter of a field not in the report, from the field list
                await report.getByTestId("field-menu-Manufacturer").click();
                await report.getByTestId("field-filter-Manufacturer").click();
                await expect(report.getByTestId("filter-apply")).toBeVisible();
                seen.push(...(await formFields(report)));
                await page.keyboard.press("Escape");
                expect(seen.length).toBeGreaterThan(10);
                expect(seen.filter((f) => !f.name && !f.id)).toEqual([]);
                expect(seen.filter((f) => !f.labelled)).toEqual([]);
                names[id] = new Set(seen.map((f) => f.name));
            }
            expect([...names.one].filter((n) => names.two.has(n))).toEqual([]);
        });
    }
});
