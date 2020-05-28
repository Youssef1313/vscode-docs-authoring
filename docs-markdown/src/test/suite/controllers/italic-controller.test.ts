/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as chai from 'chai';
import * as spies from 'chai-spies';
import { resolve } from 'path';
import { commands, Selection, window } from 'vscode';
import { formatItalic, italicFormattingCommand } from '../../../controllers/italic-controller';
import * as common from '../../../helper/common';
import * as telemetry from '../../../helper/telemetry';
import { loadDocumentAndGetItReady, sleep } from '../../test.common/common';

chai.use(spies);

import sinon = require('sinon');
const expect = chai.expect;

suite('Italic Controller', () => {
	// Reset and tear down the spies
	teardown(() => {
		chai.spy.restore(common);
	});
	suiteTeardown(async () => {
		await commands.executeCommand('workbench.action.closeAllEditors');
	});
	test('italicFormattingCommand', () => {
		const controllerCommands = [{ command: formatItalic.name, callback: formatItalic }];
		expect(italicFormattingCommand()).to.deep.equal(controllerCommands);
	});
	test('noActiveEditorMessage', () => {
		const spy = chai.spy.on(common, 'noActiveEditorMessage');
		formatItalic();
		expect(spy).to.have.been.called();
	});
	test('isMarkdownFileCheck', async () => {
		const filePath = resolve(
			__dirname,
			'../../../../../src/test/data/repo/articles/docs-markdown.md'
		);
		await loadDocumentAndGetItReady(filePath);
		const stub = sinon.stub(telemetry, 'sendTelemetryData');
		const spy = chai.spy.on(common, 'isMarkdownFileCheck');
		formatItalic();
		await sleep(100);
		expect(spy).to.have.been.called();
		stub.restore();
	});
	test('Italic Format Empty Selection', async () => {
		const filePath = resolve(
			__dirname,
			'../../../../../src/test/data/repo/articles/docs-markdown.md'
		);
		await loadDocumentAndGetItReady(filePath);

		const stub = sinon.stub(telemetry, 'sendTelemetryData');
		const spy = chai.spy.on(common, 'insertContentToEditor');
		formatItalic();
		await sleep(300);
		expect(spy).to.have.been.called();
		stub.restore();
	});
	test('Italic Format Single Selection', async () => {
		const filePath = resolve(
			__dirname,
			'../../../../../src/test/data/repo/articles/docs-markdown.md'
		);
		await loadDocumentAndGetItReady(filePath);
		const editor = window.activeTextEditor;
		common.setSelectorPosition(editor!, 15, 0, 15, 1);

		const stub = sinon.stub(telemetry, 'sendTelemetryData');
		const spy = chai.spy.on(common, 'insertContentToEditor');
		formatItalic();
		await sleep(300);
		expect(spy).to.have.been.called();
		stub.restore();
	});
	test('Italic Format Word Selection', async () => {
		const filePath = resolve(
			__dirname,
			'../../../../../src/test/data/repo/articles/docs-markdown.md'
		);
		await loadDocumentAndGetItReady(filePath);
		const editor = window.activeTextEditor;
		common.setSelectorPosition(editor!, 159, 0, 159, 4);
		const stub = sinon.stub(telemetry, 'sendTelemetryData');
		formatItalic();
		await sleep(100);
		const line = editor?.document.lineAt(159).text;
		stub.restore();

		expect(line).to.equal('*Body*');
	});
	test('Italic Format Multiple Selection', async () => {
		const filePath = resolve(
			__dirname,
			'../../../../../src/test/data/repo/articles/docs-markdown.md'
		);
		await loadDocumentAndGetItReady(filePath);
		const editor = window.activeTextEditor;
		const cursorPosition = editor!.selection.active;
		const fromPositionOne = cursorPosition.with(48, 0);
		const toPositionOne = cursorPosition.with(48, 5);
		const fromPositionTwo = cursorPosition.with(48, 13);
		const toPositionTwo = cursorPosition.with(48, 17);
		editor!.selections = [
			new Selection(fromPositionOne, toPositionOne),
			new Selection(fromPositionTwo, toPositionTwo)
		];
		const stub = sinon.stub(telemetry, 'sendTelemetryData');
		formatItalic();
		await sleep(100);
		const line = editor?.document.lineAt(48).text;
		stub.restore();

		expect(line).to.equal('*These* alerts *look* like this on docs.microsoft.com:');
	});
});