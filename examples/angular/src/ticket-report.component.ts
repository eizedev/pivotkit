import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from "@angular/core";
import "pivotkit-element";
import type { PivotView } from "pivotkit-element";

@Component({
    selector: "app-root",
    // <pivot-report> is no Angular component: the schema lets the template use it
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `
        <h1>Tickets</h1>
        <p data-testid="app-view">{{ shown() }}</p>
        <pivot-report
            [data]="rows"
            [defaultView]="start"
            locale="en-US"
            (pivot-view-change)="onView($event)"
        ></pivot-report>
        <table class="page-table">
            <tr><td>A table of the page</td></tr>
        </table>
    `
})
export class TicketReportComponent {
    // data and views are properties: Angular sets them on the element, never as attributes
    readonly rows = [
        { Ticket: 1, Team: "Billing", Priority: "High" },
        { Ticket: 2, Team: "Billing", Priority: "Low" },
        { Ticket: 3, Team: "Network", Priority: "High" },
        { Ticket: 4, Team: "Network", Priority: "High" },
        { Ticket: 5, Team: "Network", Priority: "Low" },
        { Ticket: 6, Team: "Support", Priority: "Low" }
    ];
    readonly start: PivotView = { rows: ["Team"], values: [{ field: "Ticket", agg: "count" }] };
    readonly view = signal<PivotView>(this.start);
    readonly shown = () => `Rows: ${this.view().rows?.join(", ") || "none"}; columns: ${this.view().cols?.join(", ") || "none"}`;

    onView(event: Event) {
        // a real app stores the view (a server, the URL); this one shows what it got
        this.view.set((event as CustomEvent<{ view: PivotView }>).detail.view);
    }
}
