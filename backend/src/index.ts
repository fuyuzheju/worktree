import createApp from "./app.js";

const port = 824;
const app = createApp();
app.listen(port, () => {
    console.log(`Server running on port ${port}.`);
});