# 🈺 Foundry VTT Journal Translator

**Journal Translator** is a Foundry VTT module that adds a `Translate` option to journal entries. It sends the journal content to the OpenAI API and returns a translated version, with options to either:

- Create a new journal entry
- Prepend the translation to the original
- Replace the original content

Supports HTML preservation and uses OpenAI's batch processing for efficient handling of large journals.

---

## ✨ Features

- Adds "Translate" to the journal context menu
- Uses OpenAI's Chat Completions API (via GPT-4o)
- Supports batch translation of multiple journal pages
- Preserves Foundry-specific HTML and tags (e.g. `@Check`)
- Three translation modes: `new`, `prepend`, or `replace`

---

## ⚙️ Setup

### 1. Install the Module

- Copy or clone this repo into your Foundry VTT `modules/` directory.
- Enable it in your Foundry world.

### 2. Configure Settings

Go to **Settings → Configure Settings → Module Settings**:

| Setting              | Description |
|----------------------|-------------|
| `OpenAI API Key`     | Your OpenAI API key. Required. |
| `Custom Prompt`      | Prompt sent to OpenAI (e.g., `"Translate to Polish."`). System prompt already contains information about preserving HTML so this is mostly to select your language. |
| `Translation Mode`   | Choose between `Create New` - creates a new Journal with the translated text, `Prepend` - prepends each page with the translated text, leaving the original at the bottom, or `Replace` - replaces the original content with translation. This can lead to data loss as the original text is removed so use with caution. |

---

## 🧠 How It Works

Right-click any journal entry and select **Translate**. The module will:

1. Fetch all content from the journal pages
2. Send it to OpenAI’s batch API using your custom prompt
3. Receive translated content
4. Apply it to the journal based on your chosen mode

---

## 📦 Translation Modes

- **New**: Creates a new journal entry named `"[Original Name] (Translated)"`
- **Prepend**: Adds the translation before the original content in the same page
- **Replace**: Replaces the original content entirely