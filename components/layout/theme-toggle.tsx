"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STORAGE_KEY = "gazin-theme";

export function ThemeToggle() {
  const label = "Alternar modo claro/escuro";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={label}
            title={label}
            onClick={() => {
              const root = document.documentElement;
              const nextIsDark = !root.classList.contains("dark");
              root.classList.toggle("dark", nextIsDark);
              root.style.colorScheme = nextIsDark ? "dark" : "light";
              window.localStorage.setItem(
                STORAGE_KEY,
                nextIsDark ? "dark" : "light",
              );
            }}
          >
            <Moon className="dark:hidden" />
            <Sun className="hidden dark:block" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
