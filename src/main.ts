import * as core from "@actions/core";
import * as github from "@actions/github";
import { createReadStream, statSync } from "fs";
import walkSync from "walk-sync";
import { WebClient } from "@slack/web-api";
import axios from "axios";
import FormData from "form-data";
import { GitHub } from "@actions/github/lib/utils";
import { Context } from "@actions/github/lib/context";

async function run(): Promise<void> {
  try {
    const context = github.context;

    const token = core.getInput("token");
    const channels = core.getInput("channels");
    const workdir = core.getInput("workdir") || "e2e/cypress";
    const githubToken = core.getInput("github-token");

    const octokit = github.getOctokit(githubToken);

    const prInfo = await getPrInfo(octokit, context);

    const messageText =
      core.getInput("message-text") ||
      ":oh_no: The Cypress test in the workflow you just triggered has failed.\nPlease check the screenshots in the thread.👇🏻";

    core.debug(`Token: ${token}`);
    core.debug(`Channels: ${channels}`);
    core.debug(`Message text: ${messageText}`);

    const actor = context.actor;
    const { data: user } = await octokit.rest.users.getByUsername({
      username: actor,
    });

    core.debug("Start initializing slack SDK");
    const slack = new WebClient(token);
    core.debug("Slack SDK initialized successfully");

    core.debug("Checking for videos and/or screenshots from cypress");
    const screenshots = walkSync(workdir, {
      globs: ["**/*.png", "**/*.jpg", "**/*.jpeg"],
    });

    if (screenshots.length <= 0) {
      core.debug("No videos or screenshots found. Exiting!");
      core.setOutput("result", "No videos or screenshots found!");
      return;
    }

    core.debug(`Found ${screenshots.length} screenshots`);
    core.debug("Sending initial slack message");

    const result = await slack.chat.postMessage({
      attachments: [
        {
          fallback: messageText,
          author_name: user.login,
          author_link: user.html_url,
          author_icon: user.avatar_url,
          color: "#6e6e6e",
          title: prInfo.title,
          title_link: prInfo.url,
          text: messageText,
        },
      ],
      channel: channels,
    });

    const threadId = result.ts as string;
    const channelId = result.channel as string;

    if (screenshots.length > 0) {
      core.debug("Uploading screenshots...");

      await Promise.all(
        screenshots.map(async (screenshot) => {
          core.debug(`Uploading ${screenshot}`);
          const filePath = `${workdir}/${screenshot}`;

          const stats = statSync(filePath);
          const fileSizeInBytes = stats.size;

          const { upload_url, file_id } =
            await slack.files.getUploadURLExternal({
              filename: screenshot,
              length: fileSizeInBytes,
            });

          if (!upload_url || !file_id) {
            throw new Error("Could not get upload URL");
          }

          const file = createReadStream(filePath);

          await axios.post(upload_url, file, {
            headers: { Authorization: `Bearer ${token}` },
          });

          slack.files.completeUploadExternal({
            channel_id: channelId,
            thread_ts: threadId,
            files: [{ id: file_id, title: screenshot }],
          });
        })
      );
    }

    core.debug("...done!");
    core.setOutput("result", "🚀🚀🚀🚀🚀");
  } catch (error) {
    core.setFailed((error as { message: string }).message);
  }
}

async function getPrInfo(
  octokit: InstanceType<typeof GitHub>,
  context: Context
) {
  if (!context.payload.pull_request?.number) return { title: "", url: "" };

  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number,
  });
  const title = pullRequest.title;
  const url = pullRequest.html_url;

  return { title, url };
}

run();
