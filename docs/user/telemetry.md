# Usage data and diagnostics

This build of fcode sends no product usage data to the fcode team. The server, desktop app, web app,
and mobile app omit analytics, relay connection tracing, automated crash reporting, and agent feedback reporting.

Diagnostics stay on your machine: the server and desktop app write logs and traces to their own
state folders. **Settings > Maintenance > Diagnostics** reads those files.

## Agent activity for mobile notifications

When **Publish agent activity** is enabled on a host, it sends project and thread titles, model
names, activity status, and environment and thread identifiers to the fcode Connect relay for
[mobile notifications and live activities](./mobile-notifications.md). It is a feature you turn on, not usage data.

To stop publishing, turn off **Publish agent activity** under **Settings > Sharing & access** on
the host. Turning off notifications on a phone controls that phone's alerts, not the host's
publishing setting.
