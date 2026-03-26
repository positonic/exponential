"use client";

import type { ReactNode } from "react";
import { Container } from "@mantine/core";
import { ProjectViewTabs, type ProjectView } from "./ProjectViewTabs";

interface ProjectViewLayoutProps {
  activeView: ProjectView;
  children: ReactNode;
}

export function ProjectViewLayout({
  activeView,
  children,
}: ProjectViewLayoutProps) {
  return (
    <Container size="xl" className="py-6">
      <ProjectViewTabs activeView={activeView} />
      {children}
    </Container>
  );
}
