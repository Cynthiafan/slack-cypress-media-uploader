"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const fs_1 = require("fs");
const walk_sync_1 = __importDefault(require("walk-sync"));
const web_api_1 = require("@slack/web-api");
const axios_1 = __importDefault(require("axios"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const context = github.context;
            const token = core.getInput('token');
            const channels = core.getInput('channels');
            const workdir = core.getInput('workdir') || 'cypress';
            const githubToken = core.getInput('github-token');
            const color = core.getInput('color') || '#6e6e6e';
            const octokit = github.getOctokit(githubToken);
            const prInfo = yield getPrInfo(octokit, context);
            const messageText = core.getInput('message-text') ||
                'The Cypress test in the workflow you just triggered has failed.\nPlease check the screenshots in the thread.👇🏻';
            core.debug(`Token: ${token}`);
            core.debug(`Channels: ${channels}`);
            core.debug(`Message text: ${messageText}`);
            const actor = context.actor;
            const { data: user } = yield octokit.rest.users.getByUsername({ username: actor });
            core.debug('Start initializing slack SDK');
            const slack = new web_api_1.WebClient(token);
            core.debug('Slack SDK initialized successfully');
            const screenshots = (0, walk_sync_1.default)(workdir, { globs: ['**/*.png'] });
            const videos = (0, walk_sync_1.default)(workdir, { globs: ['**/*.mp4'] });
            if (!screenshots.length && !videos.length) {
                core.debug('No screenshots or videos found. Exiting...');
                core.setOutput('result', 'No screenshots or videos found.');
                return;
            }
            core.debug(`Found ${screenshots.length} screenshots and ${videos.length} videos`);
            core.debug('Sending Slack message');
            const result = yield slack.chat.postMessage({
                attachments: [
                    {
                        fallback: messageText,
                        author_name: user.login,
                        author_link: user.html_url,
                        author_icon: user.avatar_url,
                        color,
                        title: prInfo.title,
                        title_link: prInfo.url,
                        text: messageText
                    }
                ],
                channel: channels
            });
            const threadId = result.ts;
            const channelId = result.channel;
            if (!threadId || !channelId) {
                core.debug('No threadId or channelId from the postMessage response.. Exiting...');
                core.setOutput('result', 'No threadId or channelId from the postMessage response.');
                return;
            }
            if (screenshots.length > 0) {
                core.debug('Uploading screenshots...');
                yield Promise.all(screenshots.map((screenshot) => __awaiter(this, void 0, void 0, function* () {
                    yield uploadMedia(slack, { media: screenshot, workdir, channelId, threadId, token });
                })));
            }
            if (videos.length > 0) {
                core.debug('Uploading videos...');
                yield Promise.all(screenshots.map((video) => __awaiter(this, void 0, void 0, function* () {
                    yield uploadMedia(slack, { media: video, workdir, channelId, threadId, token });
                })));
            }
            core.debug('...done!');
            core.setOutput('result', '🚀🚀🚀🚀🚀');
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
function getPrInfo(octokit, context) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!((_a = context.payload.pull_request) === null || _a === void 0 ? void 0 : _a.number))
            return { title: '', url: '' };
        const { data: pullRequest } = yield octokit.rest.pulls.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: context.payload.pull_request.number
        });
        const title = pullRequest.title;
        const url = pullRequest.html_url;
        return { title, url };
    });
}
function uploadMedia(slack_1, _a) {
    return __awaiter(this, arguments, void 0, function* (slack, { token, media, workdir, channelId, threadId }) {
        core.debug(`Uploading ${media}`);
        const filePath = `${workdir}/${media}`;
        const stats = (0, fs_1.statSync)(filePath);
        const fileSizeInBytes = stats.size;
        const { upload_url, file_id } = yield slack.files.getUploadURLExternal({
            filename: media,
            length: fileSizeInBytes
        });
        if (!upload_url || !file_id) {
            core.debug('No upload_url or file_id from the getUploadURLExternal response. Exiting...');
            core.setOutput('result', 'No upload_url or file_id from the getUploadURLExternal response.');
            return;
        }
        const file = (0, fs_1.createReadStream)(filePath);
        yield axios_1.default.post(upload_url, file, {
            headers: { Authorization: `Bearer ${token}` }
        });
        slack.files.completeUploadExternal({
            channel_id: channelId,
            thread_ts: threadId,
            files: [{ id: file_id, title: media }]
        });
    });
}
run();
