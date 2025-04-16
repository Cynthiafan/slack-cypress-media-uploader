import * as core from '@actions/core'
import * as github from '@actions/github'
import { createReadStream, statSync } from 'fs'
import walkSync from 'walk-sync'
import { WebClient } from '@slack/web-api'
import axios from 'axios'
import { GitHub } from '@actions/github/lib/utils'
import { Context } from '@actions/github/lib/context'

async function run(): Promise<void> {
  try {
    const context = github.context

    const token = core.getInput('token')
    const channels = core.getInput('channels')
    const workdir = core.getInput('workdir') || 'cypress'
    const githubToken = core.getInput('github-token')
    const color = core.getInput('color') || '#6e6e6e'

    const octokit = github.getOctokit(githubToken)

    const prInfo = await getPrInfo(octokit, context)

    const messageText =
      core.getInput('message-text') ||
      'The Cypress test in the workflow you just triggered has failed.\nPlease check the screenshots in the thread.👇🏻'

    core.debug(`Token: ${token}`)
    core.debug(`Channels: ${channels}`)
    core.debug(`Message text: ${messageText}`)

    const actor = context.actor
    const { data: user } = await octokit.rest.users.getByUsername({ username: actor })

    core.debug('Start initializing slack SDK')
    const slack = new WebClient(token)
    core.debug('Slack SDK initialized successfully')

    const screenshots = walkSync(workdir, { globs: ['**/*.png'] })
    const videos = walkSync(workdir, { globs: ['**/*.mp4'] })

    if (!screenshots.length && !videos.length) {
      core.debug('No screenshots or videos found. Exiting...')
      core.setOutput('result', 'No screenshots or videos found.')
      return
    }

    core.debug(`Found ${screenshots.length} screenshots and ${videos.length} videos`)

    core.debug('Sending Slack message')
    const result = await slack.chat.postMessage({
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
    })

    const threadId = result.ts
    const channelId = result.channel

    if (!threadId || !channelId) {
      core.debug('No threadId or channelId from the postMessage response.. Exiting...')
      core.setOutput('result', 'No threadId or channelId from the postMessage response.')
      return
    }

    if (screenshots.length > 0) {
      core.debug('Uploading screenshots...')
      await Promise.all(
        screenshots.map(async (screenshot) => {
          await uploadMedia(slack, { media: screenshot, workdir, channelId, threadId, token })
        })
      )
    }

    if (videos.length > 0) {
      core.debug('Uploading videos...')
      await Promise.all(
        videos.map(async (video) => {
          await uploadMedia(slack, { media: video, workdir, channelId, threadId, token })
        })
      )
    }

    core.debug('...done!')
    core.setOutput('result', '🚀🚀🚀🚀🚀')
  } catch (error) {
    core.setFailed((error as { message: string }).message)
  }
}

async function getPrInfo(octokit: InstanceType<typeof GitHub>, context: Context) {
  if (!context.payload.pull_request?.number) return { title: '', url: '' }

  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number
  })
  const title = pullRequest.title
  const url = pullRequest.html_url

  return { title, url }
}

interface UploadMediaConfig {
  token: string
  media: string
  workdir: string
  channelId: string
  threadId: string
}

async function uploadMedia(slack: WebClient, { token, media, workdir, channelId, threadId }: UploadMediaConfig) {
  core.debug(`Uploading ${media}`)
  const filePath = `${workdir}/${media}`

  const stats = statSync(filePath)
  const fileSizeInBytes = stats.size

  const { upload_url, file_id } = await slack.files.getUploadURLExternal({
    filename: media,
    length: fileSizeInBytes
  })

  if (!upload_url || !file_id) {
    core.debug('No upload_url or file_id from the getUploadURLExternal response. Exiting...')
    core.setOutput('result', 'No upload_url or file_id from the getUploadURLExternal response.')
    return
  }

  const file = createReadStream(filePath)

  await axios.post(upload_url, file, {
    headers: { Authorization: `Bearer ${token}` }
  })

  slack.files.completeUploadExternal({
    channel_id: channelId,
    thread_ts: threadId,
    files: [{ id: file_id, title: media }]
  })
}

run()
