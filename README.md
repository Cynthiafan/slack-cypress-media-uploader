# Slack Cypress Media Uploader

Uploading the screenshots to the Slack channels if Cypress failed.

## Inputs

### `token`

**Required** Slack bot token.

### `github-token`

**Required** GitHub token to get pull request information.

### `channels`

**Required** The channels to send the message to.

### `workdir`

The directory to store the screenshots.
Default `"e2e/cypress"`.

### `message-text`

The message to send.
Default `":oh_no: The Cypress test in the workflow you just triggered has failed.\nPlease check the screenshots in the thread.👇🏻"`.

### `color`

The color of the quote line.

## Example usage

```yaml
uses: Cynthiafan/slack-cypress-media-uploader@1.0.9
if: failure()
  with:
    token: ${{ secrets.SLACK_TOKEN }}
    github-token: ${{ secret.GITHUB_TOKEN }}
    channels: ''
    message-text: ''
```
