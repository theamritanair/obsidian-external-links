import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ItemView,
	IconName,
	TFile,
	TAbstractFile,
} from "obsidian";

interface ExternalLinksPluginSettings {
	excludePatterns: string[];
	excludePathRegex: string;
	linkCache: Record<string, string[]>;
}

const DEFAULT_SETTINGS: ExternalLinksPluginSettings = {
	excludePatterns: [],
	excludePathRegex: "",
	linkCache: {},
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
		return "External links";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.createEl("h4", { text: "External links in vault" });

		const buttonContainer = container.createEl("div", {
			cls: "external-links-button-container",
		});

		const expandAllButton = buttonContainer.createEl("button", {
			text: "Expand all",
			cls: "external-links-expand-button",
		});

		const collapseAllButton = buttonContainer.createEl("button", {
			text: "Collapse all",
			cls: "external-links-collapse-button",
		});

		// Add click handlers for expand/collapse all
		expandAllButton.addEventListener("click", () => {
			const lists = container.querySelectorAll(".external-links-sublist");
			lists.forEach((list: HTMLElement) => {
				list.classList.remove("hidden");
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
				list.classList.add("hidden");
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

	updateView(links: { file: string; links: string[] }[]) {
		const container = this.containerEl.children[1];

		// Clear existing content except for the header and buttons
		const list = container.querySelector(".external-links-list");
		if (list) {
			list.remove();
		}
		const summary = container.querySelector(".external-links-summary");
		if (summary) {
			summary.remove();
		}
		const emptyMessage = container.querySelector(
			".external-links-empty-message"
		);
		if (emptyMessage) {
			emptyMessage.remove();
		}

		this.displayLinks(links, container);
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
					fileHeader.classList.toggle("collapsed");
					list.classList.toggle("hidden");
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

		new Setting(containerEl)
			.setName("Exclude path regex")
			.setDesc("Regex to exclude file paths from the list")
			.addText((text) =>
				text
					.setPlaceholder("^private/")
					.setValue(this.plugin.settings.excludePathRegex)
					.onChange(async (value) => {
						this.plugin.settings.excludePathRegex = value;
						await this.plugin.saveSettings();
						this.plugin.fullRefresh();
					})
			);

		new Setting(containerEl)
			.setName("Exclude patterns")
			.setDesc(
				"Regex patterns to exclude from external links (one per line)"
			)
			.addTextArea((text) =>
				text
					.setPlaceholder("^https://excluded-domain.com")
					.setValue(this.plugin.settings.excludePatterns.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.excludePatterns = value
							.split("\n")
							.filter((p) => p.length > 0);
						await this.plugin.saveSettings();
						this.plugin.fullRefresh();
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
			(leaf: WorkspaceLeaf) => new ExternalLinksView(leaf)
		);

		this.app.workspace.onLayoutReady(() => {
			this.fullRefresh();
		});

		// Register event handlers for file changes
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				this.updateFileCache(file);
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.removeFileFromCache(file);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.renameFileInCache(file, oldPath);
			})
		);

		this.addRibbonIcon("link", "External links", async () => {
			await this.activateView();
		});

		this.addCommand({
			id: "show-external-links",
			name: "Show external links",
			callback: async () => {
				await this.activateView();
			},
		});

		this.addSettingTab(new ExternalLinksSettingTab(this.app, this));
	}

	onunload() {
		this.saveSettings();
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
		this.refreshView();
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

	async fullRefresh() {
		this.settings.linkCache = {};
		const files = this.app.vault.getMarkdownFiles();
		const excludePathRegex = this.settings.excludePathRegex
			? new RegExp(this.settings.excludePathRegex)
			: null;

		for (const file of files) {
			if (excludePathRegex && excludePathRegex.test(file.path)) {
				continue;
			}
			await this.updateFileCache(file, false);
		}
		this.refreshView();
	}

	async updateFileCache(file: TFile, refresh = true) {
		const excludePathRegex = this.settings.excludePathRegex
			? new RegExp(this.settings.excludePathRegex)
			: null;

		if (excludePathRegex && excludePathRegex.test(file.path)) {
			delete this.settings.linkCache[file.path];
			if (refresh) {
				this.refreshView();
			}
			return;
		}

		const content = await this.app.vault.cachedRead(file);
		const links = this.extractExternalLinks(content);
		if (links.length > 0) {
			this.settings.linkCache[file.path] = links;
		} else {
			delete this.settings.linkCache[file.path];
		}
		if (refresh) {
			this.refreshView();
		}
	}

	async removeFileFromCache(file: TAbstractFile) {
		if (file instanceof TFile) {
			delete this.settings.linkCache[file.path];
			this.refreshView();
		}
	}

	async renameFileInCache(file: TAbstractFile, oldPath: string) {
		if (file instanceof TFile) {
			if (this.settings.linkCache[oldPath]) {
				this.settings.linkCache[file.path] =
					this.settings.linkCache[oldPath];
				delete this.settings.linkCache[oldPath];
				this.refreshView();
			}
		}
	}

	private extractExternalLinks(content: string): string[] {
		const urlRegex = /\[([^\]]*)\]\((https?:\/\/[^\s\\)]+)\)/g;
		const plainUrlRegex = /(https?:\/\/[^\s\\)]+)/g;
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

		const excludePatterns = this.settings.excludePatterns.map(
			(p) => new RegExp(p)
		);

		const filteredLinks = links.filter(
			(link) => !excludePatterns.some((p) => p.test(link))
		);

		return [...new Set(filteredLinks)];
	}

	private refreshView() {
		const leaves = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_EXTERNAL_LINKS
		);
		for (const leaf of leaves) {
			if (leaf.view instanceof ExternalLinksView) {
				const links = Object.entries(this.settings.linkCache).map(
					([file, links]) => ({
						file,
						links,
					})
				);
				leaf.view.updateView(links);
			}
		}
	}
}
