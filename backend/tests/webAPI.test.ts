import request from "supertest";
import createApp from "@/app.js";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient; // only used to clean up database
describe("webAPI", () => {
    beforeAll(async () => {
        process.env.DATABASE_URL = "file:./webAPI.test.db";
        execSync('npx prisma db push --force-reset');
        prisma = new PrismaClient();
    });

    beforeEach(async () => {
        await prisma.historyMetadata.deleteMany();
        await prisma.confirmedHistory.deleteMany();
        await prisma.user.deleteMany();
    });

    it("checks health", async () => {
        const app = createApp();
        const response = await request(app).get("/public/health/");
        expect(response.statusCode).toBe(200);
        expect(response.text).toBe("Server running");
    });

    it("processes register", async () => {
        const app = createApp();
        const user1 = {"username": "user1", "password": "abc123"};
        const user2 = {"username": "user2", "password": "abc123"};
        const badrequest1 = {"username": "user1", "password": "abc123"};
        const badrequest2 = {"username": "user3", "password": "123"};
        const badrequest3 = {};
        const badrequest4 = {"username": null, "password": null};

        const response1 = await request(app).post("/public/register/").send(user1);
        const response2 = await request(app).post("/public/register/").send(user2);
        const response3 = await request(app).post("/public/register/").send(badrequest1);
        const response4 = await request(app).post("/public/register/").send(badrequest2);
        const response5 = await request(app).post("/public/register/").send(badrequest3);
        const response6 = await request(app).post("/public/register/").send(badrequest4);

        console.log(response1.body);
        console.log(response1.text);
        expect(response1.statusCode).toBe(200);
        expect(response1.body).toEqual({"message": "success"});
        expect(response2.statusCode).toBe(200);
        expect(response2.body).toEqual({"message": "success"});
        expect(response3.statusCode).toBe(400);
        expect(response3.body).toEqual({"message": "The username already exists"});
        expect(response4.statusCode).toBe(400);
        expect(response4.body).toEqual({"message": "invalid password"});
        expect(response5.statusCode).toBe(400);
        expect(response5.body).toEqual({"message": "missing username or password"});
        expect(response6.statusCode).toBe(400);
        expect(response6.body).toEqual({"message": "missing username or password"});

        const prisma = new PrismaClient();
        const users = await prisma.user.findMany();
        // console.log(users);
        expect(users.length).toBe(2);
        expect(users.map(user => user.name)).toEqual([user1.username, user2.username]);
    });

    it("processes login", async () => {
        const app = createApp();
        const user1 = {"username": "user1", "password": "abc123"};
        const user2 = {"username": "user2", "password": "abc123"};
        const response1 = await request(app).post("/public/register/").send(user1);
        expect(response1.statusCode).toBe(200);
        const response2 = await request(app).post("/public/register/").send(user2);
        expect(response2.statusCode).toBe(200);
        const response3 = await request(app).post("/public/login/").send(user1);
        expect(response3.statusCode).toBe(200);
        expect(response3.body).toHaveProperty("access_token");
        expect(response3.body).toHaveProperty("user_id");
        const response4 = await request(app).post("/public/login/").send({});
        expect(response4.statusCode).toBe(400);
        expect(response4.body).toEqual({"message": "missing fields"});
        const response5 = await request(app).post("/public/login/").send({"username": "user3", "password": "abc123"});
        expect(response5.statusCode).toBe(401);
        expect(response5.body).toEqual({"message": "wrong username or password"});
        const response6 = await request(app).post("/public/login").send({"username": "user1", "password": "abc"});
        expect(response6.statusCode).toBe(401);
        expect(response6.body).toEqual({"message": "wrong username or password"});
        const response7 = await request(app).post("/public/login/").send({"username": null});
        expect(response7.statusCode).toBe(400);
        expect(response7.body).toEqual({"message": "missing fields"});
    });
})