"use client";

import Link from "next/link";
import { LogOutIcon, Settings2Icon, UserIcon } from "lucide-react";

import { signOut } from "@/lib/auth/actions";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar?: string;
    plan: string;
  };
}) {
  const { isMobile } = useSidebar();
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}
          >
            <Avatar className="rounded-lg">
              {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
              <AvatarFallback className="rounded-lg">
                {initials || <UserIcon className="size-4" />}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.plan}
              </span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-60"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1.5">
                  <span className="truncate text-sm font-medium text-white">
                    {user.name}
                  </span>
                  <span className="truncate text-xs text-white/60">
                    {user.email}
                  </span>
                  <span className="mt-0.5 w-fit rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white/80 uppercase">
                    {user.plan}
                  </span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/settings" />}>
                <Settings2Icon />
                Studio settings
              </DropdownMenuItem>
              <form action={signOut}>
                <DropdownMenuItem
                  nativeButton
                  render={<button type="submit" className="w-full" />}
                >
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </form>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
