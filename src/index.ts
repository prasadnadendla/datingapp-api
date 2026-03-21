import fastify from "fastify";
import * as AppConfig from './conf/config.json'
import { setLogger } from "./log";
import { Secret } from "otpauth";
import cors from "@fastify/cors";
const app = fastify({
  logger: { level: "debug" },
  trustProxy: true
})

setLogger(app.log)
import { Graph, GraphInput, SignIn, SignInInput, SignInVerify, SignInVerifyInput, uploadImageSchema, deleteImageSchema, OnboardSchema, OnboardInput, UpdateProfileSchema, UpdateProfileInput, BlockUserSchema, BlockUserInput, ReportUserSchema, ReportUserInput, DeleteOtpSchema, DeleteConfirmSchema } from './models/middleware'
import { getTotpInstance, validate } from "./validator";
import { sendOTP } from "./otp/twofactor";
import { getUser, createUser, getGeoLocation, activateUser, saveToken, executeMutation, executeQuery, onboardUser, getUserProfile, updateDatingProfile, checkChatPermission, getMatches, checkReciprocalSwipe, createMatch, blockUser, unblockUser, reportUser, markAccountForDeletion } from './db/queries'
import fastifyMetrics from 'fastify-metrics'
import fastifyJwt from "@fastify/jwt";
import rateLimit from '@fastify/rate-limit'
import { parseErrorMessage } from "./utils"
import { sendPushNotification } from "./notifications"
import { Subscribe, SubscribeInput } from "./models/subscribe";
import { deleteImageById, uploadImage, uploadEvidenceFile } from "./db/s3";
import multipart from "@fastify/multipart";
import { parse } from "graphql";
import { authorizeGraphQL } from "./graphqlauthz";
import fs from "fs";

const corsOrigin = AppConfig.cors;
const corsOptions: { origin: RegExp[] | string[], methods: string[] } = { origin: [], methods: [] };
corsOrigin.origin.forEach((origin, index) => {
  try {
    if (origin.includes("$"))
      corsOptions.origin[index] = new RegExp(origin.replace(/\./g, '\\.'));
    else
      corsOptions.origin[index] = origin;

  } catch (e) { console.warn(e); }
});
corsOptions.methods = corsOrigin.methods
app.register(cors, corsOptions);
app.register(fastifyMetrics, {
  endpoint: '/system/metrics',
})
app.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute'
});
app.register(fastifyJwt, {  secret: {
    private: fs.readFileSync('./dist/conf/private.key'),
    public: fs.readFileSync('./dist/conf/public.key')
  }, sign: { algorithm: 'ES256',iss: 'auth.genzyy.in', aud: 'genzyy-app' }, verify: { algorithms: ['ES256'] } })

app.addHook("onRequest", async (request, reply) => {
  try {
    if (request.url.includes("/api/") || request.url.includes("/system/")) {
      if (!request.headers.authorization) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }
      const token = request.headers.authorization.split(" ")[1];
      if (!token) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }
      if (request.url.includes("/system/")) {
         if(token !== AppConfig.system_code) {
            reply.status(401).send({ error: "Unauthorized" });
            return;
         }
         return;
      }
      //TODO: verify token revocation
      await request.jwtVerify()
    }
  } catch (err) {
     request.log.error(err, "failed to verify token")
     reply.status(401).send({ error: "Unauthorized" });
     return;
  }
})

app.get('/system/health', async (request, res) => {
  res.code(200).send({ status: 'ok', uptime: process.uptime() });
})

const statusTracker: any = {};

app.addHook('onResponse', async (request, reply) => {
  const route = (request.routeOptions && request.routeOptions.url) ? request.routeOptions.url : request.url;
  const method = request.method;
  const status = reply.statusCode;

  const key = `${method} ${route}`;

  if (!statusTracker[key]) {
    statusTracker[key] = {};
  }

  if (!statusTracker[key][status]) {
    statusTracker[key][status] = 0;
  }

  statusTracker[key][status]++;
});


app.get('/system/status', async (request, reply) => {
  reply.send(statusTracker);
});

app.get('/', async (request, res) => {
  res.code(200).send({ hello: "What's up" })
})

/** Transform DB snake_case user row to camelCase for frontend */
function toUserResponse(u: any) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    age: u.age,
    gender: u.gender,
    city: u.city,
    photos: u.photos ?? [],
    tags: u.tags ?? [],
    motherTongue: u.mother_tongue,
    intent: u.intent,
    religion: u.religion,
    community: u.community,
    education: u.education,
    profession: u.profession,
    height: u.height ?? null,
    salary: u.salary ?? null,
    netWorth: u.net_worth ?? null,
    assets: u.assets ?? [],
    zodiac: u.zodiac ?? null,
    birthStar: u.birth_star ?? null,
    voiceIntroUrl: u.voice_intro_url,
    isVerified: u.is_verified ?? false,
    verifiedType: u.verified_type,
    isPremium: u.is_premium ?? false,
    sparkPassExpiry: u.spark_pass_expiry,
    isOnboarded: u.is_onboarded ?? false,
  };
}


/**
 * Sign in endpoint
 * This endpoint handles user sign-in by checking if the user exists and sending a OTP code to their email/phone.
 * If the user does not exist, it creates a new user with a generated secret.
 */
app.post("/signin", { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (req, res) => {
  try {
    const { data, error } = validate(SignIn, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    if (AppConfig.test.active && data.phone === AppConfig.test.phone) {
      res.code(204).send();
      return;
    }
    const payload: SignInInput = data;
    //TODO: check if user exists
    const user = await getUser(payload.phone);
    if (user) {
      const code = getTotpInstance(payload.phone, user.secret).generate();
      sendOTP(payload.phone, code) //send otp

      res.code(204).send();
      return;
    }
    // create new user
    const secret = new Secret().base32
    let location = null;
    try { location = await getGeoLocation(req.ip); } catch (e) { req.log.error(e, "Failed to get geolocation") }
    // create new user
    const newUser = await createUser(payload.phone, secret, location);
    if (!newUser) {
      res.status(500).send({ error: "Failed to create account" });
      return;
    }
    const code = getTotpInstance(payload.phone, secret).generate();
    sendOTP(payload.phone, code);
    res.code(204).send();
    return;

  } catch (ex) {
    req.log.error(ex, "failed to process signin")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

/**
 * Verify endpoint
 * This endpoint verifies the OTP code sent to the user's email/phone.
 */
app.post("/verify", { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (req, res) => {  // endpoint to verify code 
  try {
    const { data, error } = validate(SignInVerify, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    //For testing
    if (AppConfig.test.active && data.phone === AppConfig.test.phone && data.code === AppConfig.test.otp) {
      const user = await getUser(data.phone);
      const token = app.jwt.sign({ phone: data.phone, uid: user!.id })
      const profile = await getUserProfile(user!.id);
      res.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
      res.header("Pragma", "no-cache")
      res.header("Expires", "0")
      res.send({ token, user: toUserResponse(profile) });
      getGeoLocation(req.ip).catch(() => { });
      return
    }
    const { phone, code }: SignInVerifyInput = data;
    const user = await getUser(phone);
    if (!user) {
      res.code(400).send();
      return;
    }
    const valid = getTotpInstance(phone, user.secret).validate({ token: code, window: 1 })
    if (valid == null) { // Invalid Pin
      res.status(401).send({ error: `Invalid Code` })
      return;
    }

    if (!user.is_active) {
      const activated = await activateUser(user.id);
      if (!activated.id) {
        res.status(500).send({ error: "Failed to activate user" });
        return;
      }
    }

    if (user.blocked) {
      res.status(401).send({ error: "Your account is suspended. please contact our support system" });
      return;
    }


    const token = await app.jwt.sign({ phone: data.phone, uid: user!.id })
    const profile = await getUserProfile(user!.id);

    res.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    res.header("Pragma", "no-cache")
    res.header("Expires", "0")
    res.send({ token, user: toUserResponse(profile) });
    const location = await getGeoLocation(req.ip);
    saveToken(user!.id, token, location)
  } catch (ex) {
    req.log.error(ex, "failed to process verify")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

/** endpoint for push subscription */

app.post("/api/subscribe", async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const { data, error } = validate(Subscribe, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    const subscription: SubscribeInput = data;
    try {
      const response = await executeMutation(`mutation createSubscription($object:da_pushsubs_insert_input!){
      insert_da_pushsubs_one(object:$object,on_conflict: {constraint: pushsubs_uid_key, update_columns: []}){
        id
      }
    }`, { object: subscription.token ? { uid: user.uid, android_pushsubs: { data: [subscription] } } : { uid: user.uid, web_pushsubs: { data: [subscription] } } });
      if (response.errors || !response.data) {
        res.status(500).send({ error: "Failed to save subscription" });
        return;
      }
    } catch (err: any) {
      if (err.message.includes('cannot proceed to insert array relations since insert to ')) {
        const key = subscription.token ? 'android_pushsubs' : 'web_pushsubs'
        const getSubscriptionId = await executeQuery(`query getpushSubId($uid:uuid!) {
          da_pushsubs(where:{uid:{_eq:$uid}}){
            id
          }
          }`, { uid: user.uid })
        if (getSubscriptionId.error || getSubscriptionId.errors || getSubscriptionId.data.da_pushsubs.length == 0) { // this should never happen unless if there's an issue gql server for a while
          res.status(400).send({ error: "Invalid Request" })
          return;
        }
        const pushsub_id = getSubscriptionId.data.da_pushsubs[0].id
        const response = await executeMutation(`mutation createPushSubscription($object:da_${key}_insert_input!){
      insert_da_${key}_one(object:$object){
        id
      }
    }`, { object: { ...subscription, pushsub_id } });
        if (response.errors || !response.data) {
          res.status(500).send({ error: "Failed to save subscription" });
          return;
        }
      }

      res.status(500).send({ error: "Failed to save subscription" });
      return;

    }
    res.code(204).send();
  } catch (ex) {
    const error = parseErrorMessage(ex);
    if (error) { // constraint violation, this means subscription already exists
      res.code(204).send();
      return;
    }
    req.log.error(ex, "failed to subscribe")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

async function onMutation(response: any, graph: GraphInput, userId: string) {
  try {
    const ast = parse(graph.query);
    const def = ast.definitions[0];
    if (!def || def.kind !== 'OperationDefinition') return response;

    const selection = def.selectionSet.selections[0];
    if (!selection || selection.kind !== 'Field') return response;

    const operationName = selection.name.value;

    if (operationName === 'insert_da_swipes_one') {
      const variables = graph.variables || {};
      const action = variables.object?.action;
      const targetId = variables.object?.target_id;

      if ((action === 'like' || action === 'super_like') && targetId) {
        const isReciprocal = await checkReciprocalSwipe(userId, targetId);
        if (isReciprocal) {
          const match = await createMatch(userId, targetId);
          if (match) {
            // Notify the other user asynchronously — don't block the response
            getUserProfile(userId).then(user => {
              sendPushNotification(targetId, {
                title: "It's a Match!",
                body: `You and ${user?.name || 'someone'} liked each other!`,
                icon: '/icons/icon-192x192.png',
                data: { url: '/matches', matchId: match.id }
              });
            }).catch(() => {});
            // Push real-time new_match event to both users via CF Worker
            // matchedUserId is the OTHER party so each DO can hot-add the match to its routing map
            if (AppConfig.worker.apiKey) {
              const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AppConfig.worker.apiKey}` };
              fetch(`${AppConfig.worker.url}/sys/deliver`, {
                method: 'POST', headers,
                body: JSON.stringify({ targetUserId: userId, type: 'new_match', matchId: match.id, matchedUserId: targetId }),
              }).catch(() => {});
              fetch(`${AppConfig.worker.url}/sys/deliver`, {
                method: 'POST', headers,
                body: JSON.stringify({ targetUserId: targetId, type: 'new_match', matchId: match.id, matchedUserId: userId }),
              }).catch(() => {});
            }
            return { ...response, data: { ...response.data, _match: match } };
          }
        }
      }
    }
  } catch (err) {
    app.log.error(err, 'onMutation handler failed');
  }
  return response;
}

app.post("/api/graph", { preHandler: [authorizeGraphQL] }, async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const { data, error } = validate(Graph, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    const graph: GraphInput = data;
    const ast = parse(graph.query);
    if (!ast) {
      res.status(400).send({ error: "Invalid GraphQL query" });
      return;
    }
    if (ast.definitions.length === 0 || ast.definitions.length > 1) {

      res.status(400).send({ error: "Empty GraphQL query" });
      return;
    }
    const definition = ast.definitions[0];
    if (definition && definition.kind === "OperationDefinition") {
      if (definition.operation === "query") {
        return await executeQuery(graph.query, graph.variables || {})
      } else if (definition.operation === "mutation") {
        const response = await executeMutation(graph.query, graph.variables || {})
        return await onMutation(response, graph, user.uid);
      }
      res.status(400).send({ error: "Invalid GraphQL operation" });
      return;
    }
    res.status(400).send({ error: "Invalid GraphQL operation" });
  } catch (ex) {
    const error = parseErrorMessage(ex);
    if (error) {
      res.status(200).send(error);
      return;
    }
    req.log.error(ex, "failed to execute query")
    res.status(500).send({ error: "Internal Server Error" })
  }

})


app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1 // Limit to one file per request
  }
})

app.post("/api/image", async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const file = await req.file();
    if (!file) {
      return res.status(400).send({ error: 'Image is required.' });
    }
    const buffer = await file.toBuffer();

    const { error } = validate(uploadImageSchema, {
      image: {
        type: file.mimetype,
        size: buffer.length,
        buffer,
        originalname: file.filename,
      },
    });
    if (error) {
      res.status(400).send(error);
      return;
    }
    const response = await uploadImage(buffer, user.uid);
    if ('error' in response) {
      req.log.error({error:response.error}, "Image upload failed")
      res.status(500).send({ error: "Failed to upload image" })
      return;
    }
    req.log.info({url:response.url}, `Image uploaded successfully`);
    return res.status(201).send({ url: response.url });
  } catch (ex) {
    req.log.error(ex, "failed to upload image")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

app.delete("/api/image", async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const payload = req.body as { url: string };
    const { data, error } = validate(deleteImageSchema, payload);
    if (error) {
      res.status(400).send(error);
      return;
    }
    const { url } = data;
    const id = url.split('/').pop();
    if (!id) {
      res.status(400).send({ error: "Invalid image URL" });
      return;
    }
    // delete file from storage
    await deleteImageById(id.split(/[_.]/)[0], user.uid);
    res.status(204).send();
  } catch (ex) {
    req.log.error(ex, "failed to delete image")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

/**
 * Onboard endpoint
 * Sets up the user's dating profile during first-time onboarding.
 */
app.post("/api/onboard", async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const { data, error } = validate(OnboardSchema, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    const payload: OnboardInput = data;
    const updated = await onboardUser(user.uid, payload.name, payload.purpose[0], {
      age: payload.details.age,
      gender: payload.details.gender,
      city: payload.details.city,
      photos: payload.details.photos,
      tags: payload.details.tags,
      motherTongue: payload.details.motherTongue,
      height: payload.details.height,
      education: payload.details.education,
      profession: payload.details.profession,
      zodiac: payload.details.zodiac,
    });
    if (!updated) {
      res.status(500).send({ error: "Failed to onboard user" });
      return;
    }
    res.send({ user: toUserResponse(updated) });
  } catch (ex) {
    req.log.error(ex, "failed to onboard user")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

/**
 * Get user profile
 */
app.get("/api/profile", async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const profile = await getUserProfile(user.uid);
    if (!profile) {
      res.status(404).send({ error: "Profile not found" });
      return;
    }
    res.send({ user: toUserResponse(profile) });
  } catch (ex) {
    req.log.error(ex, "failed to get profile")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

/**
 * Update dating profile
 */
app.put("/api/profile", async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const { data, error } = validate(UpdateProfileSchema, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    const payload: UpdateProfileInput = data;
    // Convert camelCase to snake_case for DB
    const set: Record<string, any> = {};
    if (payload.name !== undefined) set.name = payload.name;
    if (payload.age !== undefined) set.age = payload.age;
    if (payload.city !== undefined) set.city = payload.city;
    if (payload.intent !== undefined) set.intent = payload.intent;
    if (payload.photos !== undefined) set.photos = payload.photos;
    if (payload.tags !== undefined) set.tags = payload.tags;
    if (payload.motherTongue !== undefined) set.mother_tongue = payload.motherTongue;
    if (payload.religion !== undefined) set.religion = payload.religion;
    if (payload.community !== undefined) set.community = payload.community;
    if (payload.education !== undefined) set.education = payload.education;
    if (payload.profession !== undefined) set.profession = payload.profession;
    if (payload.height !== undefined) set.height = payload.height;
    if (payload.salary !== undefined) set.salary = payload.salary;
    if (payload.netWorth !== undefined) set.net_worth = payload.netWorth;
    if (payload.assets !== undefined) set.assets = payload.assets;
    if (payload.zodiac !== undefined) set.zodiac = payload.zodiac;
    if (payload.birthStar !== undefined) set.birth_star = payload.birthStar;

    if (Object.keys(set).length === 0) {
      res.status(400).send({ error: "No fields to update" });
      return;
    }
    const updated = await updateDatingProfile(user.uid, set);
    if (!updated) {
      res.status(500).send({ error: "Failed to update profile" });
      return;
    }
    res.send({ user: toUserResponse(updated) });
  } catch (ex) {
    req.log.error(ex, "failed to update profile")
    res.status(500).send({ error: "Internal Server Error" })
  }
})


/**
 * Block a user
 */
app.post("/api/user/block", async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const { data, error } = validate(BlockUserSchema, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    const payload: BlockUserInput = data;
    if (payload.targetId === user.uid) {
      res.status(400).send({ error: "Cannot block yourself" });
      return;
    }
    const result = await blockUser(user.uid, payload.targetId);
    if (!result) {
      res.status(500).send({ error: "Failed to block user" });
      return;
    }
    res.status(204).send();
    // Notify blocked user via CF Worker (fire-and-forget)
    if (AppConfig.worker.apiKey) {
      fetch(`${AppConfig.worker.url}/sys/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AppConfig.worker.apiKey}` },
        body: JSON.stringify({ targetUserId: payload.targetId, type: 'blocked', blockerUserId: user.uid }),
      }).catch(() => {});
    }
  } catch (ex) {
    const error = parseErrorMessage(ex);
    if (error) {
      res.status(409).send({ error: "User is already blocked" });
      return;
    }
    req.log.error(ex, "failed to block user")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

/**
 * Unblock a user
 */
app.delete("/api/user/block", async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const { data, error } = validate(BlockUserSchema, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    const payload: BlockUserInput = data;
    const affected = await unblockUser(user.uid, payload.targetId);
    if (affected === 0) {
      res.status(404).send({ error: "Block not found" });
      return;
    }
    res.status(204).send();
    // Notify unblocked user via CF Worker (fire-and-forget)
    if (AppConfig.worker.apiKey) {
      fetch(`${AppConfig.worker.url}/sys/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AppConfig.worker.apiKey}` },
        body: JSON.stringify({ targetUserId: payload.targetId, type: 'unblocked', blockerUserId: user.uid }),
      }).catch(() => {});
    }
  } catch (ex) {
    req.log.error(ex, "failed to unblock user")
    res.status(500).send({ error: "Internal Server Error" })
  }
})

/**
 * Upload report evidence (chat transcript as HTML) — returns a public URL
 */
app.post("/api/user/report/evidence", async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const body = req.body as { content?: string };
    if (!body?.content || typeof body.content !== 'string' || body.content.length > 2_000_000) {
      res.status(400).send({ error: "Missing or oversized content" });
      return;
    }
    const result = await uploadEvidenceFile(body.content, 'text/html');
    if ('error' in result) {
      res.status(500).send({ error: "Failed to upload evidence" });
      return;
    }
    res.status(201).send({ url: result.url });
  } catch (ex) {
    req.log.error(ex, "failed to upload evidence");
    res.status(500).send({ error: "Internal Server Error" });
  }
})

/**
 * Report a user
 */
app.post("/api/user/report", async (req, res) => {
  try {
    const user = req.user as object & { uid: string }
    if (!user) {
      res.status(401).send({ error: "Unauthorized" })
      return;
    }
    const { data, error } = validate(ReportUserSchema, req.body);
    if (error) {
      res.status(400).send(error);
      return;
    }
    const payload: ReportUserInput = data;
    if (payload.targetId === user.uid) {
      res.status(400).send({ error: "Cannot report yourself" });
      return;
    }
    const result = await reportUser(user.uid, payload.targetId, payload.reason, payload.comment, payload.evidenceUrl);
    if (!result) {
      res.status(500).send({ error: "Failed to submit report" });
      return;
    }
    res.status(204).send();
  } catch (ex) {
    req.log.error(ex, "failed to report user")
    res.status(500).send({ error: "Internal Server Error" })
  }
})


app.get("/system/chat/permitted", async (req, res) => {
  try {
    const { userId, targetId } = req.query as { userId: string, targetId: string }
    if (!userId || !targetId) {
      res.status(400).send({ error: "Missing required parameters" });
      return;
    }
    const permitted = await checkChatPermission(userId, targetId);
    res.send({ permitted });
  } catch (ex) {
    req.log.error(ex, "failed to check chat permission")
    res.status(500).send({ error: "Internal Server Error" })
  }
})


app.get("/system/matches", async (req, res) => {
  try {
    const { userId } = req.query as { userId: string }
    if(!userId){
      res.status(400).send({ error: "Missing required parameters" });
      return;
    }
     const matches = await getMatches(userId);
     res.send((matches || []).map((match:any) => ({
      match_id: match.id,
      matched_user_id: match.user1_id === userId ? match.user2_id : match.user1_id
     })))
  } catch (ex) {
    req.log.error(ex, "failed to get matches")
  }
})

app.post("/system/notify", async (req, res) => {
    const { userId, payload } = req.body as {
        userId: string;
        payload: {
            messageId: string;
            matchId: string;
            senderId: string;
            type: string;
            timestamp: number;
            content?: string;
            url?: string;
            blurHash?: string;
            silent?: boolean;
        };
    };

    if (!userId || !payload) {
        return res.status(400).send({ error: 'Missing userId or payload' });
    }

    let title: string;
    let body: string;

    if (payload.silent) {
        // Voice message — data-only, no visible notification
        await sendPushNotification(userId, {
            title: '',
            body: '',
            data: payload,
        });
        return res.status(204).send();
    }

    switch (payload.type) {
        case 'photo':
            title = 'New Photo';
            body = 'Sent you a photo';
            break;
        case 'gif':
            title = 'New GIF';
            body = 'Sent you a GIF';
            break;

        case 'emoji':
            title = 'New Message';
            body = payload.content ?? '😊';
            break;
        case 'text':
        default:
            title = 'New Message';
            body = payload.content ?? 'You have a new message';
            break;
    }

    const image = (payload.type === 'photo' || payload.type === 'gif') && payload.url
        ? `${payload.url}_200.webp`
        : undefined;

    await sendPushNotification(userId, { title, body, image, data: payload });
    return res.status(204).send();
})



/**
 * Request OTP to begin account deletion flow.
 * No JWT required — uses phone + OTP to authenticate the deletion intent.
 */
app.post('/account/delete-otp', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (req, res) => {
  try {
    const { data, error } = validate(DeleteOtpSchema, req.body);
    if (error) return res.status(400).send(error);

    const user = await getUser(data.phone);
    if (!user || user.is_deleted) {
      // Return 204 even if not found to avoid phone enumeration
      return res.status(204).send();
    }
    const code = getTotpInstance(data.phone, user.secret).generate();
    sendOTP(data.phone, code);
    return res.status(204).send();
  } catch (ex) {
    req.log.error(ex, 'failed to send delete otp');
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

/**
 * Confirm account deletion with OTP.
 * Marks the account as deleted immediately; hard-delete is scheduled 30 days out.
 */
app.post('/account/delete-confirm', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, res) => {
  try {
    const { data, error } = validate(DeleteConfirmSchema, req.body);
    if (error) return res.status(400).send(error);

    const user = await getUser(data.phone);
    if (!user || user.is_deleted) {
      return res.status(404).send({ error: 'Account not found' });
    }
    const valid = getTotpInstance(data.phone, user.secret).validate({ token: data.code, window: 1 });
    if (valid == null) {
      return res.status(401).send({ error: 'Invalid or expired code' });
    }
    await markAccountForDeletion(user.id);
    req.log.info({ userId: user.id }, 'account marked for deletion');
    return res.status(204).send();
  } catch (ex) {
    req.log.error(ex, 'failed to confirm account deletion');
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

app.listen({ port: AppConfig.port, host: '0.0.0.0' }, (err, address) => {
  if (err) throw err
  app.log.info(`app running at ${address}`)
})
