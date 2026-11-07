// Prints the tutorial narration lines as JSON (used by tools/narrate.py).
import { LINES } from '../web/tutorial/script';
process.stdout.write(JSON.stringify(LINES));
