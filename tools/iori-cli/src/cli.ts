import { deleteCommand } from './commands/delete.js';
import { interactiveCommand } from './commands/interactive.js';
import { loginCommand } from './commands/login.js';
import { notificationsCommand } from './commands/notifications.js';
import { postCommand } from './commands/post.js';
import { timelineCommand } from './commands/timeline.js';
import { clearSession } from './session.js';

const HELP = `iori - CLI client for iori

Usage:
  iori <command> [options]

Commands:
  (none) / tl    Interactive TUI
  login          Log in to a server
  timeline       Show timeline (non-interactive)
  post           Create a post
  delete         Delete a post
  notifications  Show notifications
  logout         Clear session
  help           Show this help
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const rest = args.slice(1);

  switch (command) {
    case 'login':
      return loginCommand(rest);
    case 'tl':
      return interactiveCommand();
    case 'timeline':
      return timelineCommand(rest);
    case 'post':
      return postCommand(rest);
    case 'delete':
    case 'rm':
      return deleteCommand(rest);
    case 'notifications':
    case 'notif':
      return notificationsCommand(rest);
    case 'logout':
      await clearSession();
      console.log('Logged out.');
      return;
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return;
    case undefined:
      return interactiveCommand();
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
