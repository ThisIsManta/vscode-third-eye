import * as fs from 'fs'
import * as fp from 'path'
import * as vscode from 'vscode'

enum TYPES {
	FILE,
	DIRECTORY,
}

class FileWatcher extends vscode.Disposable {
	private watcher: vscode.FileSystemWatcher
	private existingPaths = new Map<string, TYPES>()

	public FILE = TYPES.FILE
	public DIRECTORY = TYPES.DIRECTORY

	constructor() {
		super(() => {
			this.watcher.dispose()
		})

		this.watcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false)
		this.watcher.onDidCreate(e => {
			this.existingPaths.set(e.fsPath, TYPES.FILE)
		})
		this.watcher.onDidDelete(e => {
			this.existingPaths.delete(e.fsPath)

			const associatedDirectoryPath = fp.dirname(e.fsPath)
			if (fs.existsSync(associatedDirectoryPath) === false) {
				this.existingPaths.delete(associatedDirectoryPath)
			}
		})
	}

	has(path: string, type?: TYPES) {
		if (this.existingPaths.has(path)) {
			return true
		}

		if (fs.existsSync(path)) {
			this.existingPaths.set(path, fs.lstatSync(path).isFile() ? TYPES.FILE : TYPES.DIRECTORY)
			return true
		}

		return false
	}
}

export default new FileWatcher()