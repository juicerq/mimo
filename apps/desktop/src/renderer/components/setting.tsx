import type { ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@renderer/components/ui/toggle-group";

export function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<section className="mt-5 first:mt-0">
			<h3 className="mb-2 text-xs font-medium text-muted-foreground">{label}</h3>
			{children}
		</section>
	);
}

interface SettingProps<T extends string> {
	label: string;
	value: T;
	options: readonly T[];
	names: Record<T, string>;
	onChange: (value: T) => void;
}

export function Setting<T extends string>({ label, value, options, names, onChange }: SettingProps<T>) {
	return (
		<Field label={label}>
			<ToggleGroup
				aria-label={label}
				value={[value]}
				onValueChange={(next) => {
					const picked = options.find((option) => option === next[0]);
					if (picked) {
						onChange(picked);
					}
				}}
				spacing={0.5}
				className="w-full rounded-lg bg-muted p-0.5"
			>
				{options.map((option) => (
					<ToggleGroupItem
						key={option}
						value={option}
						size="sm"
						className="flex-1 rounded-md text-muted-foreground hover:bg-transparent aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
					>
						{names[option]}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</Field>
	);
}
