"use client";

import { CourseView } from "@/components/course/CourseView";

/** Install tab: Installer Training. */
export default function InstallCourse() {
  return <CourseView id="install" base="/api/install" title="Installer Training" sub="Every step of an install and a takedown." teamHref="/install/team"
    teamRoles={["owner", "manager", "lead"]} signoffNote="Your crew lead still signs you off on a real job." />;
}
