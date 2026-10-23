import { useState } from "react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SidebarNavItem } from "@/components/SidebarNavItem";
import { SidebarSection } from "@/components/SidebarSection";
import { primarySidebarStyles } from "@/components/primary-sidebar-styles";
import { pageById } from "./pages";
import type { SidebarProposalSection } from "./sidebar-proposal";

function iconFor(name: string): LucideIcon {
  const icon = (Icons as unknown as Record<string, LucideIcon | undefined>)[name];
  return icon ?? Icons.Circle;
}

function ProposedSection({ section }: { section: SidebarProposalSection }) {
  const [open, setOpen] = useState(!section.collapsed);
  const items = section.items.map((id) => {
    const page = pageById(id);
    return <SidebarNavItem key={id} to={page.route} label={page.name} icon={iconFor(page.icon)} />;
  });
  if (!section.label) return <div className={primarySidebarStyles.group}>{items}</div>;
  return (
    <SidebarSection
      label={section.label}
      divider
      collapsible={section.collapsed ? { open, onOpenChange: setOpen } : undefined}
    >
      {items}
    </SidebarSection>
  );
}

/** Draws a sidebar proposal with the same parts the real sidebar uses. */
export function ProposedSidebar({ sections }: { sections: SidebarProposalSection[] }) {
  return (
    <aside className={`${primarySidebarStyles.surface} flex h-full w-60 flex-col border-r border-border bg-background`}>
      <nav className={primarySidebarStyles.nav}>
        {sections.map((section, index) => <ProposedSection key={`${section.label}-${index}`} section={section} />)}
      </nav>
    </aside>
  );
}
