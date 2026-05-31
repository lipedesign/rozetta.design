"use client"

import Link from "next/link"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { ChevronRightIcon } from "lucide-react"

interface NavSubItem {
  title: string
  url: string
  onClick?: () => void
}

interface NavItem {
  title: string
  url: string
  icon: React.ReactNode
  isActive?: boolean
  onClick?: () => void
  items?: NavSubItem[]
}

interface NavMainProps {
  items: NavItem[]
  label?: string
}

export function NavMain({ items, label }: NavMainProps) {
  const renderNavTarget = (url: string, onClick?: () => void) => {
    if (onClick) return <button type="button" />
    if (url.startsWith("/")) return <Link href={url} />
    return <a href={url} />
  }

  return (
    <SidebarGroup>
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible
            key={item.title}
            open={item.isActive ?? false}
            render={<SidebarMenuItem />}
          >
            <SidebarMenuButton
              tooltip={item.title}
              isActive={item.isActive}
              onClick={item.onClick}
              render={renderNavTarget(item.url, item.onClick)}
            >
              {item.icon}
              <span>{item.title}</span>
            </SidebarMenuButton>
            {item.items?.length ? (
              <>
                <CollapsibleTrigger
                  render={
                    <SidebarMenuAction className="aria-expanded:rotate-90" />
                  }
                >
                  <ChevronRightIcon />
                  <span className="sr-only">Toggle</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton
                          onClick={subItem.onClick}
                          render={renderNavTarget(subItem.url, subItem.onClick)}
                        >
                          <span>{subItem.title}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </>
            ) : null}
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
