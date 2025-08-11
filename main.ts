import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ItemView,
	IconName,
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

	getIcon(): IconName {
		return "link";
	}

	getDisplayText() {
		return "External Links";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.createEl("h4", { text: "External Links in Vault" });

		const buttonContainer = container.createEl("div", {
			cls: "external-links-button-container",
		});

		const expandAllButton = buttonContainer.createEl("button", {
			text: "Expand All",
			cls: "external-links-expand-button",
		});

		const collapseAllButton = buttonContainer.createEl("button", {
			text: "Collapse All",
			cls: "external-links-collapse-button",
		});

		const links = await this.collectExternalLinks();
		this.displayLinks(links, container);

		// Add click handlers for expand/collapse all
		expandAllButton.addEventListener("click", () => {
			const lists = container.querySelectorAll(".external-links-sublist");
			lists.forEach((list: HTMLElement) => {
				list.style.display = "block";
				const header = list.parentElement?.querySelector(
					".external-links-file-header"
				);
				header?.classList.remove("collapsed");
			});
			expandAllButton.classList.add("is-active");
			collapseAllButton.classList.remove("is-active");
		});

		collapseAllButton.addEventListener("click", () => {
			const lists = container.querySelectorAll(".external-links-sublist");
			lists.forEach((list: HTMLElement) => {
				list.style.display = "none";
				const header = list.parentElement?.querySelector(
					".external-links-file-header"
				);
				header?.classList.add("collapsed");
			});
			collapseAllButton.classList.add("is-active");
			expandAllButton.classList.remove("is-active");
		});

		// Set initial state (expanded by default)
		expandAllButton.classList.add("is-active");
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
				cls: "external-links-empty-message",
			});
			return;
		}

		const linkCount = links.reduce(
			(sum, fileLinks) => sum + fileLinks.links.length,
			0
		);
		container.createEl("p", {
			text: `Found ${linkCount} external links in ${links.length} files`,
			cls: "external-links-summary",
		});

		const ul = container.createEl("ul", { cls: "external-links-list" });
		for (const fileLinks of links) {
			const li = ul.createEl("li", { cls: "external-links-file" });
			const fileHeader = li.createEl("div", {
				cls: "external-links-file-header",
			});

			fileHeader.createEl("span", {
				text: "📄",
				cls: "external-links-file-icon",
			});
			fileHeader.createEl("strong", {
				text: fileLinks.file,
				cls: "external-links-filename",
			});

			fileHeader.createEl("span", {
				text: `${fileLinks.links.length} links`,
				cls: "external-links-count-badge",
			});

			// Add click handler for collapse/expand
			fileHeader.addEventListener("click", (e) => {
				const list = fileHeader.parentElement?.querySelector(
					".external-links-sublist"
				) as HTMLElement;
				if (list) {
					const isCollapsed =
						fileHeader.classList.contains("collapsed");
					list.style.display = isCollapsed ? "block" : "none";
					fileHeader.classList.toggle("collapsed");
				}
			});

			const linksList = li.createEl("ul", {
				cls: "external-links-sublist",
			});

			for (const link of fileLinks.links) {
				const linkItem = linksList.createEl("li", {
					cls: "external-links-item",
				});
				const linkContainer = linkItem.createEl("div", {
					cls: "external-links-link-container",
				});

				linkContainer.createEl("span", {
					text: "🔗",
					cls: "external-links-link-icon",
				});

				const a = linkContainer.createEl("a", {
					href: link,
					text: link,
					cls: "external-links-url",
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

		// Register event handlers for file changes
		this.registerEvent(
			this.app.vault.on("modify", () => {
				this.refreshView();
			})
		);

		this.registerEvent(
			this.app.vault.on("create", () => {
				this.refreshView();
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", () => {
				this.refreshView();
			})
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

	private async refreshView() {
		const leaves = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_EXTERNAL_LINKS
		);
		for (const leaf of leaves) {
			if (leaf.view instanceof ExternalLinksView) {
				await leaf.view.onOpen();
			}
		}
	}
}
