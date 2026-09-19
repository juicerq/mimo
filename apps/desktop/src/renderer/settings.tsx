import { SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "@renderer/components/icon-button";
import { Setting } from "@renderer/components/setting";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@renderer/components/ui/dialog";
import { Kbd, KbdGroup } from "@renderer/components/ui/kbd";
import { THEME_NAMES, THEMES, useTheme } from "./theme";

export function Settings() {
	const [open, setOpen] = useState(false);
	const [theme, chooseTheme] = useTheme();

	useEffect(() => {
		function onKey(event: KeyboardEvent): void {
			if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || event.key !== ",") {
				return;
			}
			event.preventDefault();
			setOpen((current) => !current);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<IconButton
				label="Configurações"
				tip={
					<>
						Configurações{" "}
						<KbdGroup>
							<Kbd>Ctrl</Kbd>
							<Kbd>,</Kbd>
						</KbdGroup>
					</>
				}
				side="top"
				aria-keyshortcuts="Control+Comma"
				onClick={() => setOpen(true)}
			>
				<SettingsIcon />
			</IconButton>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Configurações</DialogTitle>
				</DialogHeader>
				<section>
					<Setting label="Tema" value={theme} options={THEMES} names={THEME_NAMES} onChange={chooseTheme} />
				</section>
			</DialogContent>
		</Dialog>
	);
}
