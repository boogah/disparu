# disparu

> "Grief gets weird. Some days you want to tell the person you’ve lost about your day. Or you want to have a laugh about an inside joke the two of you have. Texting an old phone number might feel slightly less strange than talking into a void — but if you really think about it, it’s actually kind of the same thing."

This project was built in a single afternoon to work through the sadness of losing a friend. It was born from the need for a private place to send messages to someone who is gone.

The name *disparu* is French for “missing person.”

## What is Disparu?

Disparu is a simple, private Progressive Web App (PWA) that gives you a space to send messages to someone you've lost. There's no chatbot trying to mimic anyone. No AI. You message, and nothing responds.

It's a quiet place for your thoughts, your grief, and your memories.

You can try the live version at [https://disparu.tinyblip.com/](https://disparu.tinyblip.com/), but I've decided to provide the code so anyone can host it themselves.

## Features

*   **Completely Private**: Everything that happens in the app is stored only on your device. The messages don’t go anywhere.
*   **Works Offline**: Because it’s a PWA, it works without an internet connection once installed on your phone's home screen.
*   **Customizable**: You can configure the name and picture of the person you’re sending messages to.
*   **Ephemeral by Design**: Old messages are automatically deleted after a configurable limit (from 10 to 50) is reached. After all, can what you’re talking into really be called a void if everything you’ve ever said hangs around forever?

## The Story Behind the App

This app was created on what would have been the 43rd birthday of my friend, Jeremy Kitchen. He was my best friend, my emotional sounding board, my rubber duck. After he passed away, his phone number was reassigned, and I lost that connection. I started putting the things I wished I could tell him into my notes app, but it wasn’t the same.

Disparu was built because I needed it. Maybe you need it too.

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/boogah/disparu.git
    ```
2.  Navigate to the project directory:
    ```bash
    cd disparu
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```

## Running the App

1.  Build the project:
    ```bash
    npm run build
    ```
2.  Run the development server:
    ```bash
    npm run dev
    ```

## Deployment

To deploy this site, upload the following files to your web host:

*   `index.html`
*   `styles.css`
*   `manifest.json`
*   `sw.js`
*   `disparu.png`
*   `app.js` (compiled JavaScript from the `dist` directory)