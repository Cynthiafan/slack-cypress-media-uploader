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
const github_1 = __importDefault(require("@actions/github"));
const fs_1 = require("fs");
const walk_sync_1 = __importDefault(require("walk-sync"));
const web_api_1 = require("@slack/web-api");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const context = github_1.default.context;
            const token = core.getInput("token");
            const channels = core.getInput("channels");
            const workdir = core.getInput("workdir") || "e2e/cypress";
            const githubToken = core.getInput("github-token");
            const octokit = github_1.default.getOctokit(githubToken);
            const workflowUrl = getWorkflowInfo(context);
            const prInfo = getPrInfo(octokit, context);
            const messageText = core.getInput("message-text") ||
                [
                    prInfo,
                    `The <${workflowUrl}|automation test> you triggered just failed.`,
                    "Please check the screenshots in the thread. 👇🏻",
                ].join("\n");
            core.debug(`Token: ${token}`);
            core.debug(`Channels: ${channels}`);
            core.debug(`Message text: ${messageText}`);
            const actor = context.actor;
            const { data: user } = yield octokit.rest.users.getByUsername({
                username: actor,
            });
            const userName = user.login;
            const avatarUrl = user.avatar_url;
            core.debug("Start initializing slack SDK");
            const slack = new web_api_1.WebClient(token);
            core.debug("Slack SDK initialized successfully");
            core.debug("Checking for videos and/or screenshots from cypress");
            const screenshots = (0, walk_sync_1.default)(workdir, {
                globs: ["**/*.png", "**/*.jpg", "**/*.jpeg"],
            });
            if (screenshots.length <= 0) {
                core.debug("No videos or screenshots found. Exiting!");
                core.setOutput("result", "No videos or screenshots found!");
                return;
            }
            core.debug(`Found ${screenshots.length} screenshots`);
            core.debug("Sending initial slack message");
            const result = yield slack.chat.postMessage({
                blocks: [
                    {
                        type: "context",
                        elements: [
                            {
                                type: "image",
                                image_url: avatarUrl,
                                alt_text: "Github avatar",
                            },
                            {
                                type: "mrkdwn",
                                text: userName,
                            },
                        ],
                    },
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: messageText,
                        },
                    },
                ],
                channel: channels,
            });
            const threadId = result.ts;
            const channelId = result.channel;
            console.log("threadId :>> ", threadId);
            if (screenshots.length > 0) {
                core.debug("Uploading screenshots...");
                yield Promise.all(screenshots.map((screenshot) => __awaiter(this, void 0, void 0, function* () {
                    core.debug(`Uploading ${screenshot}`);
                    const filePath = workdir + screenshot;
                    const stats = (0, fs_1.statSync)(workdir + screenshot);
                    const fileSizeInBytes = stats.size;
                    const { upload_url, file_id } = yield slack.files.getUploadURLExternal({
                        filename: screenshot,
                        length: fileSizeInBytes,
                    });
                    if (!upload_url || !file_id)
                        return;
                    const file = (0, fs_1.createReadStream)(filePath);
                    const form = new form_data_1.default();
                    form.append("filename", screenshot);
                    form.append("file", file);
                    yield axios_1.default.post(upload_url, form, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    slack.files.completeUploadExternal({
                        channel_id: channelId,
                        thread_ts: threadId,
                        files: [{ id: file_id, title: screenshot }],
                    });
                })));
            }
            core.debug("...done!");
            core.setOutput("result", "🚀🚀🚀🚀🚀");
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
            return "";
        const { data: pullRequest } = yield octokit.rest.pulls.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: context.payload.pull_request.number,
        });
        const prTitle = pullRequest.title;
        const prUrl = pullRequest.html_url;
        return `🚀 <${prUrl}|${prTitle}> 🚀`;
    });
}
function getWorkflowInfo(context) {
    const workflowRunId = context.runId;
    const repoName = context.repo.repo;
    const repoOwner = context.repo.owner;
    const workflowUrl = `https://github.com/${repoOwner}/${repoName}/actions/runs/${workflowRunId}`;
    return workflowUrl;
}
run();