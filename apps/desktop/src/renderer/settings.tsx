import { SettingsIcon } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@renderer/components/icon-button";
import { Setting } from "@renderer/components/setting";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@renderer/components/ui/dialog";
import { THEME_NAMES, THEMES, useTheme } from "./theme";

export function Settings() {
	const [open, setOpen] = useState(false);
	const [theme, chooseTheme] = useTheme();

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<IconButton label="Configurações" side="top" onClick={() => setOpen(true)}>
				<SettingsIcon />
			</IconButton>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Configurações</DialogTitle>
				</DialogHeader>
				<Setting label="Tema" value={theme} options={THEMES} names={THEME_NAMES} onChange={chooseTheme} />
			</DialogContent>
		</Dialog>
	);
}
