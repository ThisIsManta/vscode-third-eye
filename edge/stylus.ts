import * as fs from 'fs'
import * as fp from 'path'
import * as vscode from 'vscode'
import * as Stylus from 'stylus'
import { findChildNodes } from 'stylus-supremacy'

export default class StylusLinker implements vscode.DocumentLinkProvider {
	static support = { language: 'stylus' }

	provideDocumentLinks(document: vscode.TextDocument, cancellationToken: vscode.CancellationToken) {
		let rootNode
		try {
			rootNode = new Stylus.Parser(document.getText()).parse()

		} catch (ex) {
			console.error(ex)
			return null
		}

		const nodes: any[] = findChildNodes(rootNode, checkImportStatement)
		const links: vscode.DocumentLink[] = []
		for (let index = 0; index < nodes.length; index++) {
			// Stop processing if it is cancelled
			if (cancellationToken && cancellationToken.isCancellationRequested === true) {
				return null
			}

			const node = nodes[index].path
			
			const highlight = new vscode.Range(node.lineno - 1, node.column, node.lineno - 1, node.column + node.nodes[0].val.length)
			
			let destination = fp.resolve(fp.dirname(document.fileName), node.nodes[0].val)
			if (fs.existsSync(destination)) {
				if (fs.lstatSync(destination).isDirectory() && fs.existsSync(fp.join(destination, 'index.styl'))) {
					destination = fp.join(destination, 'index.styl')
				}

			} else if (fs.existsSync(destination + '.styl')) {
				destination = destination + '.styl'

			} else {
				return null
			}

			links.push(new vscode.DocumentLink(highlight, vscode.Uri.file(destination)))
		}

		return links
	}
}

function checkImportStatement(node) {
	return node instanceof Stylus.nodes.Import && node.path instanceof Stylus.nodes.Expression && node.path.nodes.length > 0 && node.path.nodes[0] instanceof Stylus.nodes.String && node.path.nodes[0].val.length > 0
}
