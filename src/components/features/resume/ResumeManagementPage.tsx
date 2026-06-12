"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/features/AppShell";
import { ResumePageHeader } from "@/components/features/resume/ResumePageHeader";
import {
  ResumeWorkspace,
  type ResumeWorkspaceView,
} from "@/components/features/resume/ResumeWorkspace";

type ResumeManagementPageProps = {
  initialView?: ResumeWorkspaceView;
};

export function ResumeManagementPage({
  initialView = "manage",
}: ResumeManagementPageProps) {
  const [activeView, setActiveView] =
    useState<ResumeWorkspaceView>(initialView);

  useEffect(() => {
    function syncViewFromLocation() {
      const view = new URLSearchParams(window.location.search).get("view");

      setActiveView(view === "optimize" ? "optimize" : "manage");
    }

    window.addEventListener("popstate", syncViewFromLocation);

    return () => window.removeEventListener("popstate", syncViewFromLocation);
  }, []);

  const navigateWorkspaceView = useCallback((view: ResumeWorkspaceView) => {
    setActiveView(view);

    const nextUrl = new URL(window.location.href);

    if (view === "optimize") {
      nextUrl.searchParams.set("view", "optimize");
    } else {
      nextUrl.searchParams.delete("view");
    }

    const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextPath !== currentPath) {
      window.history.pushState({ resumeView: view }, "", nextPath);
    }
  }, []);

  const requestResumeUpload = useCallback(() => {
    if (activeView !== "manage") {
      navigateWorkspaceView("manage");
      window.setTimeout(() => {
        document
          .getElementById("resume-upload-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
      return;
    }

    const fileInput = document.getElementById("resume-file-input");

    if (fileInput instanceof HTMLInputElement) {
      fileInput.click();
      return;
    }

    document
      .getElementById("resume-upload-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeView, navigateWorkspaceView]);

  return (
    <AppShell activeHref="/resume" contained={false}>
      <ResumePageHeader
        activeView={activeView}
        onChangeView={navigateWorkspaceView}
        onUploadClick={requestResumeUpload}
      />

      <div className="mx-auto max-w-[1200px] px-5 pb-12 sm:px-10">
        <ResumeWorkspace activeView={activeView} />
      </div>
    </AppShell>
  );
}
