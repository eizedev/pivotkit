import { bootstrapApplication } from "@angular/platform-browser";
import { provideZonelessChangeDetection } from "@angular/core";
import { TicketReportComponent } from "./ticket-report.component";

// zoneless, as Angular sets up a new app: no zone.js on the page
bootstrapApplication(TicketReportComponent, { providers: [provideZonelessChangeDetection()] }).catch((error: unknown) => console.error(error));
