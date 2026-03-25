# Brainstorm Whiteboard

Brainstorm Whiteboard is a browser-based canvas for organizing ideas visually. You can create text notes, add images, connect related items with arrows, style them, and save the entire board to a single file.

It is built with React, TypeScript, Zustand, and ProseMirror, and runs as a local Vite app with no backend required. Vibe Coded With Cursor AI 

## What The App Does

- Creates text boxes for notes, ideas, and short documents.
- Creates image boxes from uploaded files or pasted clipboard images.
- Lets you drag, resize, recolor, label, and reorder boxes on a large canvas.
- Connects boxes with labeled directional links.
- Supports rich-text editing inside text boxes.
- Saves and opens boards, including bundled image assets.
- Provides undo/redo plus simple keyboard-based copy, paste, and delete actions.

## Core Concepts

### Boxes

The board is made of boxes. A box can be:

- A text box with editable rich text content.
- An image box that displays an uploaded or pasted image.

Each box stores:

- Position and size
- Optional label
- Fill, border, and text styling
- Layer order on the canvas

### Links

Links connect one box to another with an arrow. The app automatically picks sensible anchor points on each box so links stay attached as boxes move.

Links can also have an optional label, and a selected link can be deleted directly from the canvas or toolbar.

### Canvas

The whiteboard is a pannable and zoomable workspace designed for larger idea maps. The current viewport is part of the saved board state, so reopening a board restores the last saved view.

### Files

Boards are saved as `.wbz` bundles. A bundle contains:

- `whiteboard.json` for the board structure
- An `assets/` folder for any image files used on the board

The app can open `.wbz`, `.zip`, and `.json` board files. If a board contains images, it should be opened from the bundled `.wbz` file so the image assets are available.

## Main User Workflows

### Create And Edit Content

- Click `Add box` to create a new text box.
- Click `Add image` to insert an image from disk.
- Select a text box to edit its content inline.
- Use the toolbar to change label, fill color, text style, alignment, font size, and font family.

### Arrange The Board

- Drag boxes to move them.
- Resize the selected box from its bottom-right handle.
- Use the Z-order controls to bring a box forward or send it backward.
- Pan the canvas by dragging empty space.
- Zoom with the mouse wheel.

### Connect Ideas

- Switch to the `Link tool`.
- Click the source box.
- Click the destination box.
- Select a link to add a label or delete it.
- Press `Esc` to cancel link creation.

### Save And Reopen Work

- Click `Save board` to download the board as a `.wbz` bundle.
- Click `Open board` to load a previously saved board.
- Boards with images are restored together with their bundled asset files.

## Keyboard Shortcuts

- `Delete` or `Backspace`: delete the selected box or selected link
- `Ctrl+C` / `Cmd+C`: copy the selected box
- `Ctrl+V` / `Cmd+V`: paste a copied box payload
- `Ctrl+V` / `Cmd+V` with an image in the clipboard: create a new image box
- `Esc`: cancel the current link action

## Color And Styling

The toolbar includes a shared color palette for box fills and text styling. You can also open the color manager to:

- Add new custom colors
- Edit existing built-in or custom swatches
- Remove colors from the palette

This makes it easier to keep a consistent visual language across a board.

## Rich Text Support

Text boxes use a ProseMirror editor. The current toolbar exposes:

- Bold
- Italic
- Text alignment
- Font size
- Font family
- Text color

This is useful for turning a simple box into a more structured note or mini content block.

## Development

### Requirements

- Node.js
- npm

### Run Locally

```bash
npm install
npm run dev
```

The Vite dev server will print the local URL in the terminal.

### Other Scripts

```bash
npm run build
npm run lint
npm run test
npm run preview
```

## Project Structure

- `src/App.tsx`: app shell and global keyboard/clipboard handling
- `src/components/BoardView.tsx`: canvas pan, zoom, selection, and link deletion UI
- `src/components/Box.tsx`: box rendering, dragging, resizing, and editing behavior
- `src/components/LinkLayer.tsx`: SVG link rendering and link labels
- `src/components/Toolbar.tsx`: file actions, tools, styling controls, and formatting UI
- `src/components/ColorPaletteModal.tsx`: color palette management
- `src/store/whiteboardStore.ts`: centralized board state and actions
- `src/persistence/fileIo.ts`: save/load logic for `.wbz` bundles and JSON boards
- `src/persistence/assetStore.ts`: in-memory image asset registration and lookup
- `src/model/`: shared types, serialization, clipboard payloads, and geometry helpers

## Testing Focus

The project includes tests around core data behavior such as:

- serialization and parsing
- clipboard payload handling
- asset-aware file loading
- store logic
- link geometry helpers

For UI changes, the most important manual checks are:

- moving and resizing boxes
- editing text content
- creating and deleting links
- saving and reopening boards with images

## Summary

At its core, this application is a visual thinking tool. It combines note boxes, image cards, directional links, board navigation, and portable save files so a user can sketch out research, plans, or concept maps in one place.
