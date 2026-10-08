"use client";

import { TeamView } from "@/components/course/TeamView";

export default function InstallTeam() {
  return <TeamView base="/api/install" back="/install" backLabel="Installer Training" title="Installer Training: team progress"
    sub="Time counts only while a lesson is on screen and in use. Sign people off after you watch them do it on a real job." />;
}
