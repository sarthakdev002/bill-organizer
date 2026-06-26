import sys
import re
import os

files = [
    "app/(tabs)/dashboard.tsx",
    "app/(tabs)/stocks.tsx",
    "app/(tabs)/fuel.tsx",
    "app/(tabs)/creditcard.tsx",
    "app/(tabs)/compare.tsx",
    "app/budget-setup.tsx",
    "app/bills-table.tsx"
]

for file_path in files:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        if "themeColors" in content and "useColorScheme" in content and "DarkThemeColors" in content:
            continue # already processed

        # 1. Update Theme import
        content = re.sub(
            r"import\s*\{([^}]*)\}\s*from\s*'@/constants/Theme';",
            lambda m: "import {" + m.group(1).replace("Colors", "DarkThemeColors, LightThemeColors").replace(", ,", ",") + "} from '@/constants/Theme';",
            content
        )
        content = re.sub(
            r"import\s*\{([^}]*)\}\s*from\s*'../../constants/Theme';",
            lambda m: "import {" + m.group(1).replace("Colors", "DarkThemeColors, LightThemeColors").replace(", ,", ",") + "} from '../../constants/Theme';",
            content
        )

        # 2. Add useColorScheme
        if "useColorScheme" not in content:
            content = re.sub(
                r"import\s*\{([^}]*)\}\s*from\s*['\"]react-native['\"];",
                r"import {\1, useColorScheme} from 'react-native';", 
                content
            )

        # 3. Inject hooks
        content = re.sub(
            r"(export default function \w+\(.*\) {\s*)",
            r"\1const colorScheme = useColorScheme();\n  const themeColors = colorScheme === 'dark' ? DarkThemeColors : LightThemeColors;\n  const styles = getStyles(themeColors);\n  ",
            content
        )

        # 4. Replace StyleSheet.create
        content = re.sub(
            r"const styles = StyleSheet\.create\(\{",
            r"const getStyles = (themeColors: typeof LightThemeColors) => StyleSheet.create({",
            content
        )

        # 5. Global rename Colors. -> themeColors.
        content = re.sub(r"\bColors\.", "themeColors.", content)
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        print(f"Processed {file_path}")
    except Exception as e:
        print(f"Error on {file_path}: {e}")
