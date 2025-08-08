import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ItemView,
} from "obsidian";

interface ExternalLinksPluginSettings {
	excludePatterns: string[];
}

const DEFAULT_SETTINGS: ExternalLinksPluginSettings = {
	excludePatterns: [],
};

const VIEW_TYPE_EXTERNAL_LINKS = "external-links-view";

class ExternalLinksView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_EXTERNAL_LINKS;
	}

	getDisplayText() {
		return "External Links";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.createEl("h4", { text: "External Links in Vault" });

		const links = await this.collectExternalLinks();
		this.displayLinks(links, container);
	}

	async collectExternalLinks(): Promise<{ file: string; links: string[] }[]> {
		const files = this.app.vault.getMarkdownFiles();
		const results: { file: string; links: string[] }[] = [];

		for (const file of files) {
			const content = await this.app.vault.read(file);
			const links = this.extractExternalLinks(content);
			if (links.length > 0) {
				results.push({
					file: file.path,
					links: links,
				});
			}
		}

		return results;
	}

	private extractExternalLinks(content: string): string[] {
		const urlRegex = /\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/g;
		const plainUrlRegex = /(https?:\/\/[^\s\)]+)/g;
		const links: string[] = [];
		let match;

		while ((match = urlRegex.exec(content)) !== null) {
			links.push(match[2]);
		}

		while ((match = plainUrlRegex.exec(content)) !== null) {
			if (!links.includes(match[1])) {
				links.push(match[1]);
			}
		}

		return [...new Set(links)];
	}

	private displayLinks(
		links: { file: string; links: string[] }[],
		container: Element
	) {
		if (links.length === 0) {
			container.createEl("p", {
				text: "No external links found in the vault.",
			});
			return;
		}

		const ul = container.createEl("ul");
		for (const fileLinks of links) {
			const li = ul.createEl("li");
			li.createEl("strong", { text: fileLinks.file });
			const linksList = li.createEl("ul");

			for (const link of fileLinks.links) {
				const linkItem = linksList.createEl("li");
				const a = linkItem.createEl("a", {
					href: link,
					text: link,
				});
				a.addEventListener("click", (e) => {
					e.preventDefault();
					window.open(link, "_blank");
				});
			}
		}
	}
}

class ExternalLinksSettingTab extends PluginSettingTab {
	plugin: ExternalLinksPlugin;

	constructor(app: App, plugin: ExternalLinksPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "External Links Settings" });

		new Setting(containerEl)
			.setName("Exclude patterns")
			.setDesc(
				"Regex patterns to exclude from external links (one per line)"
			)
			.addText((text) =>
				text
					.setPlaceholder("^https://excluded-domain.com")
					.setValue(this.plugin.settings.excludePatterns.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.excludePatterns = value
							.split("\n")
							.filter((p) => p.length > 0);
						await this.plugin.saveSettings();
					})
			);
	}
}

export default class ExternalLinksPlugin extends Plugin {
	settings: ExternalLinksPluginSettings;
	private view: ExternalLinksView;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_EXTERNAL_LINKS,
			(leaf: WorkspaceLeaf) => (this.view = new ExternalLinksView(leaf))
		);

		this.addRibbonIcon("link", "External Links", async () => {
			await this.activateView();
		});

		this.addCommand({
			id: "show-external-links",
			name: "Show External Links",
			callback: async () => {
				await this.activateView();
			},
		});

		this.addSettingTab(new ExternalLinksSettingTab(this.app, this));
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_EXTERNAL_LINKS)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (!rightLeaf) {
				leaf = workspace.getLeaf("tab");
			} else {
				leaf = rightLeaf;
			}
			await leaf.setViewState({
				type: VIEW_TYPE_EXTERNAL_LINKS,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
