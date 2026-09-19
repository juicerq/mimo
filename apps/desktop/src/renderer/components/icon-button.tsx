import type { ComponentProps, ReactNode } from "react";
import { Button } from "@renderer/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@renderer/components/ui/tooltip";
import { cn } from "cn";

interface IconButtonProps extends Omit<ComponentProps<typeof Button>, "variant" | "size" | "title" | "aria-label"> {
	label: string;
	tip?: ReactNode;
	side?: "top" | "bottom";
}

export function IconButton({ label, tip, side = "bottom", className, ...props }: IconButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						aria-label={label}
						className={cn("no-drag rounded-full text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground dark:aria-pressed:hover:bg-muted", className)}
						{...props}
					/>
				}
			/>
			<TooltipContent side={side}>{tip ?? label}</TooltipContent>
		</Tooltip>
	);
}
