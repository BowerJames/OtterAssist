import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "hourly scheduled run",
  { hours: 1 },
  internal.events.triggerScheduledRun,
  { agentName: "scheduler", instructions: "Run scheduled tasks" }
);

export default crons;
