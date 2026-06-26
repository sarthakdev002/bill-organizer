const fs = require('fs');
const path = require('path');

const emojiToIonicons = {
    '←': 'arrow-back',
    '✕': 'close',
    '🔍': 'search',
    '📅': 'calendar-outline',
    '⬇️': 'download-outline',
    '📄': 'document-text-outline',
    '🏪': 'storefront-outline',
    '💳': 'card-outline',
    '🧾': 'receipt-outline',
    '📈': 'trending-up',
    '📉': 'trending-down',
    '📊': 'bar-chart-outline',
    '🥧': 'pie-chart-outline',
    '→': 'chevron-forward',
    '›': 'chevron-forward',
    '🗑️': 'trash-outline',
    '📷': 'camera-outline',
    '📂': 'folder-outline',
    '✨': 'sparkles-outline',
    '⚠️': 'warning-outline',
    '📍': 'location-outline',
    '💰': 'wallet-outline',
    '🚪': 'log-out-outline',
    '🍔': 'fast-food-outline',
    '⚡': 'flash-outline',
    '💧': 'water-outline',
    '🏠': 'home-outline',
    '🌐': 'globe-outline',
    '🛍️': 'bag-handle-outline',
    '🎬': 'film-outline',
    '⚕️': 'medkit-outline',
    '✈️': 'airplane-outline',
    '#': 'hashtag',
    'ℹ️': 'information-circle-outline',
    '✅': 'checkmark-circle-outline',
};

// We will only target files in the 'app' directory
const walkSync = (dir, filelist = []) => {
    fs.readdirSync(dir).forEach(file => {
        const dirFile = path.join(dir, file);
        try {
            if (fs.statSync(dirFile).isDirectory()) {
                walkSync(dirFile, filelist);
            } else if (dirFile.endsWith('.tsx') || dirFile.endsWith('.ts')) {
                filelist.push(dirFile);
            }
        } catch { }
    });
    return filelist;
};

const appDir = path.join(__dirname, 'app');
const txxFiles = walkSync(appDir);

// Regex to capture: <Text style={{ fontSize: SIZE, color: COLOR }}>EMOJI</Text>
// Or <Text style={{ fontSize: SIZE, color: COLOR, marginTop: ... }}>EMOJI</Text>
// We'll use a broad regex.

const regex = /<Text style=\{\{\s*fontSize:\s*(\d+)(?:,\s*color:\s*([^,}]+))?(?:,\s*[^}]+)?\s*\}\}>([^<]+)<\/Text>/g;
const regex2 = /<Text style=\{\[([^\]]+)\,\s*\{\s*fontSize:\s*(\d+)(?:,\s*color:\s*([^,}]+))?\s*\}\s*\]\}>([^<]+)<\/Text>/g;

let totalReplacements = 0;

for (const file of txxFiles) {
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;

    content = content.replace(regex, (match, size, color, emoji) => {
        emoji = emoji.trim();
        if (emojiToIonicons[emoji]) {
            modified = true;
            let clrStr = color ? ` color={${color}}` : ' color="#666"'; // default color
            if (clrStr.includes("Colors.")) {
                // handle Colors.primary etc
                if (!clrStr.includes('{')) clrStr = ` color={${clrStr.replace('color=', '')}}`;
            }
            return `<Ionicons name="${emojiToIonicons[emoji]}" size={${size}}${clrStr} />`;
        }
        return match;
    });

    content = content.replace(regex2, (match, arrayStyle, size, color, emoji) => {
        emoji = emoji.trim();
        if (emojiToIonicons[emoji]) {
            modified = true;
            let clrStr = color ? ` color={${color}}` : ' color="#666"';
            return `<Ionicons name="${emojiToIonicons[emoji]}" size={${size}}${clrStr} style={${arrayStyle}} />`;
        }
        return match;
    });

    if (modified) {
        if (!content.includes("import { Ionicons }")) {
            content = `import { Ionicons } from '@expo/vector-icons';\n` + content;
        }
        fs.writeFileSync(file, content);
        console.log(`Updated: ${file}`);
        totalReplacements++;
    }
}

console.log(`Total files modified: ${totalReplacements}`);
