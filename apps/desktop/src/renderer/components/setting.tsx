import { ToggleGroup, ToggleGroupItem } from "@renderer/components/ui/toggle-group";

interface SettingProps<T extends string> {
	label: string;
	value: T;
	options: readonly T[];
	names: Record<T, string>;
	onChange: (value: T) => void;
}

export function Setting<T extends string>({ label, value, options, names, onChange }: SettingProps<T>) {
	return (
		<>
			<h3 className="mb-2 text-xs font-medium text-muted-foreground">{label}</h3>
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
		</>
	);
}
