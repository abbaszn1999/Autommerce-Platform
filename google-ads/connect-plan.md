# خطة ربط Google Ads وMerchant Center عبر Composio

> المرحلة الأولى: **ربط الحساب** فقط. القراءة والتعديل والوكيل في مراحل لاحقة.
> تاريخ التحقق من المعلومات: 2026-11-02. ما لم نتأكد منه مكتوب بوضوح تحت "أسئلة مفتوحة".

## الفكرة باختصار

1. ننشئ عند Google تطبيقًا باسم **Autommerce** (مشروع Google Cloud + OAuth client).
2. نضع بيانات هذا التطبيق في **Composio**، فيصبح Composio هو من يحفظ صلاحية كل عميل ويجددها.
3. العميل يضغط **Connect Google Ads** في Autommerce، فيرى صفحة Google مكتوبًا فيها **Autommerce**، ويوافق، ثم يعود إلينا ويختار حسابه الإعلاني.
4. نفس الشيء لـ **Merchant Center** بزر منفصل وموافقة منفصلة.

```text
العميل ← Autommerce ← Composio ← Google Ads / Merchant API
            (يخزن رقم الاتصال فقط)   (يخزن الصلاحية مشفرة)
```

نحن **لا نخزن** توكنات Google عندنا. نخزن فقط رقم الاتصال في Composio (`connected_account_id`) والحساب الذي اختاره العميل.

---

## الجزء 1: ما نفعله عند Google (مرة واحدة)

| # | الخطوة | التفاصيل | المدة |
|---|---|---|---|
| 1 | **إنشاء مشروع Google Cloud** باسم Autommerce | حساب Google خاص بالشركة لا حساب شخصي | دقائق |
| 2 | **تفعيل Google Ads API وMerchant API** في المشروع | تفعيل Google Ads API يعطينا تلقائيًا مستوى **Test** (حسابات تجريبية فقط، لا تعرض إعلانات) | دقائق |
| 3 | **إعداد شاشة الموافقة (OAuth consent screen)** | الاسم Autommerce، الشعار، البريد، رابط الموقع، **رابط سياسة الخصوصية**، النطاق `autommerce.com` في Authorized domains | ساعة |
| 4 | **إضافة الصلاحيات (scopes)** | `https://www.googleapis.com/auth/adwords` لـ Google Ads، و`https://www.googleapis.com/auth/content` لـ Merchant Center | دقائق |
| 5 | **إنشاء OAuth client** من نوع Web application | Redirect URI = رابط على موقعنا يحوّل إلى Composio (انظر الجزء 3) | دقائق |
| 6 | **تحديث سياسة الخصوصية** | يجب أن تشرح كيف نستخدم بيانات Google، وتذكر التزامنا بـ Google API Services User Data Policy (Limited Use) | يوم |
| 7 | **التحقق من العلامة التجارية (Brand verification)** | Google تتحقق من الاسم والشعار والروابط وملكية النطاق | 2–3 أيام عمل |
| 8 | **طلب مستوى Explorer** | من صفحة Google Ads API Overview في Cloud Console ← Apply for access. مراجعة آلية غالبًا | سريع عادة |
| 9 | **طلب مستوى Basic** | بعد Explorer والتحقق من العلامة. 15,000 عملية يوميًا | غير محدد |
| 10 | **التحقق من التطبيق للصلاحيات الحساسة** | `adwords` صلاحية حساسة. قبل التحقق: تحذير للعميل وحد **100 مستخدم طوال عمر المشروع** لا يُعاد | نحو 10 أيام عمل |
| 11 | **تسجيل المشروع في Merchant API** (`registerGcp`) | مرة واحدة على **حساب Merchant Center إنتاجي خاص بنا** بصلاحية ADMIN، مع بريد مطور + بريد احتياطي | ساعة |
| 12 | **Standard** (لاحقًا) | عمليات غير محدودة، مراجعة يدوية نحو 10 أيام عمل، عرض تجريبي لـ Google، والتزام بـ RMF | عند الحاجة |

### مستويات الوصول وماذا تعني لنا

| المستوى | عمليات يوميًا على الحسابات الحقيقية | ملاحظة مهمة |
|---|---|---|
| Test | لا شيء (حسابات تجريبية فقط) | للتطوير |
| Explorer | 2,880 | **لا يسمح بمخطط الكلمات (Keyword Planner)** ولا إنشاء الحسابات ولا الفوترة |
| Basic | 15,000 | يكفي للإطلاق. الحصة مشتركة بين **كل** عملائنا |
| Standard | غير محدود | عند النمو |

> شاشة Keyword Planner في أداتنا لن تعمل على Explorer. نحتاج Basic لها.

### تنبيهات من Google

- **مرحلة الاختبار:** إذا بقي التطبيق في وضع Testing، تنتهي صلاحية العميل بعد **7 أيام** ويجب أن يعيد الربط. لا نطلق للعملاء إلا بعد نقله إلى Production.
- **حد 100 مستخدم:** قبل التحقق من التطبيق لا نتجاوز 100 عميل، وهذا الرقم لا يُعاد أبدًا. نستخدمه للتجربة فقط.
- **لا developer token بعد الآن:** ألغته Google في 2026-09-09، والوصول صار مرتبطًا بالمشروع.
- **عدم نسخ واجهة Google Ads:** سياسة Google تقول إن الأداة "may not replicate the Google Ads user interface". يجب مراجعة واجهتنا قبل طلب Standard.

---

## الجزء 2: ما نفعله في Composio (مرة واحدة)

1. **الاشتراك في باقة Pro** ($29 شهريًا) ووضع **سقف إنفاق** مع تنبيه.
2. **مشروعان منفصلان:** واحد للتطوير وواحد للإنتاج، لكل منهما مفتاح API خاص (`COMPOSIO_API_KEY`) في متغيرات البيئة، لا في الكود.
3. **إنشاء Auth Config لـ Google Ads:**
   Create Auth Config ← Manage authentication with custom credentials ← OAuth2 ← Use your own developer credentials ← Client ID + Client Secret من Google ← Redirect URI.
   نحفظ رقمه (`ac_...`) في `COMPOSIO_GOOGLEADS_AUTH_CONFIG_ID`.
4. **إنشاء Auth Config لـ Merchant Center** بنفس الطريقة، ونحفظه في `COMPOSIO_MERCHANT_AUTH_CONFIG_ID`.
   (Composio لا يقدم تطبيقًا جاهزًا لـ Merchant Center أصلًا، فتطبيقنا إلزامي هنا.)
5. **White Labeling** في إعدادات المشروع: شعار Autommerce واسمها على صفحة الربط.

---

## الجزء 3: رابط العودة من Google (مهم)

عند الربط يمر العميل بهذه الصفحات:

```text
Autommerce ← صفحة Google (مكتوب فيها Autommerce) ← موقعنا ← Composio ← موقعنا
```

يوجد **رابطان** مختلفان:

| الرابط | من يستخدمه | قيمته عندنا |
|---|---|---|
| **Redirect URI** (يرجع إليه Google) | Google | `https://autommerce.com/api/google-ads/oauth/callback` |
| **callbackUrl** (يرجع إليه Composio بعد الحفظ) | Composio | `https://autommerce.com/api/google-ads/connect/complete` |

**لماذا نمرر Google عبر موقعنا؟** Google تتحقق من ملكية كل النطاقات في التطبيق، ولا نستطيع إثبات ملكية `backend.composio.dev`. لذلك نسجل رابطًا على `autommerce.com`، وهذا الرابط يحوّل المتصفح فورًا إلى Composio:

```http
HTTP/1.1 302 Found
Location: https://backend.composio.dev/api/v3/toolkits/auth/callback?<نفس الاستعلام كما هو>
Cache-Control: no-store
Referrer-Policy: no-referrer
```

قواعد هذا الرابط (من توثيق Composio):
- لا يقرأ الـ `code` ولا يستبدله، فقط يحوّل.
- الوجهة ثابتة دائمًا، لا تُقرأ من الطلب.
- **لا يسجل** الاستعلام في السجلات أو أدوات التحليل، لأنه يحتوي `code`.

نفس الرابط يُكتب في Google (Authorized redirect URIs) وفي Composio (`oauth_redirect_uri`) حرفيًا. وللتطوير نضيف نسخة `http://localhost:4000/...`.

---

## الجزء 4: رحلة العميل خطوة بخطوة

### ربط Google Ads

| # | العميل يرى | يحدث في الخلفية |
|---|---|---|
| 1 | يضغط **Connect Google Ads** (مدير الـ workspace فقط) | `POST /api/google-ads/connect/start`: نتحقق أنه admin، ثم نطلب من Composio رابط الربط بـ `user_id = workspace_id` و`callbackUrl` |
| 2 | ينتقل إلى Google ويختار حسابه | — |
| 3 | يرى **"Autommerce wants to access your Google Ads"** ويضغط Allow | قد يُطلب منه passkey (انظر الأسئلة المفتوحة) |
| 4 | يمر سريعًا عبر موقعنا ثم Composio | Composio يستبدل الـ code ويحفظ الصلاحية مشفرة |
| 5 | يعود إلى صفحة الربط عندنا | `GET /api/google-ads/connect/complete`: **لا نصدق** باراميتر `status=success` في الرابط. نسأل Composio من الخادم عن اتصال هذا الـ workspace بحالة `ACTIVE` ونحفظ رقمه |
| 6 | تظهر قائمة حساباته الإعلانية | `GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS` ثم استعلام GAQL على `customer_client` لجلب الأسماء والعملة والمنطقة الزمنية وحسابات المدير (MCC) |
| 7 | يختار حسابًا واحدًا | نحفظ `customer_id` و`login_customer_id` (إن كان عبر MCC) للـ workspace |
| 8 | تظهر **Google Ads connected** وزر **Go to agent** | — |

### ربط Merchant Center (اختياري، منفصل)

نفس الخطوات مع Auth Config الخاص بـ Merchant، ثم نجلب حسابات Merchant ونطلب من العميل اختيار واحد. نعرض تنبيهًا إذا لم يكن هذا الحساب هو المربوط بحساب Google Ads المختار (هذا موجود في الواجهة الحالية: `merchantLinkState`).

### الحالات الأخرى

| الحالة | ماذا نفعل |
|---|---|
| ضغط Cancel في Google | يعود مع خطأ، نعرض "لم يكتمل الربط" وزر إعادة المحاولة |
| حساب Google بلا حسابات إعلانية | رسالة واضحة: "هذا الحساب لا يملك وصولًا لأي حساب Google Ads"، وزر للربط بحساب آخر |
| سحب العميل الإذن من Google | حالة الاتصال في Composio تصبح `REVOKED` أو تفشل العمليات، فنعرض **Reconnect** |
| **Change account** | نفس الاتصال، نعيد عرض القائمة فقط |
| **Disconnect** | `revoke()` ثم `delete()` في Composio، ثم نحذف السطر عندنا |
| workspace آخر يربط نفس حساب Google | لا مشكلة: كل workspace له `user_id` مختلف في Composio، فالاتصالات منفصلة |

---

## الجزء 5: العزل بين العملاء (قاعدة لا استثناء لها)

- في Composio: **`user_id` = `workspace_id`**. كل workspace له اتصالاته وحده.
- رقم الحساب الإعلاني (`customer_id`) **يحدده خادمنا** من قاعدة البيانات في كل طلب. أدوات Composio تقبل `customer_id` اختياريًا، لذلك **لن نعطي الوكيل أدوات Composio مباشرة**، بل أدواتنا نحن (`ads_report`، `ads_propose_change`...) التي تستدعي Composio وتضع `customer_id` بنفسها. هذا مطابق لما في [README.md](README.md) ("never from the model")، ويتفق أيضًا مع سياسة Google التي تمنع إعادة عرض الـ API كما هو.
- مفتاح Composio موجود فقط في الخادم (Next.js API و`assistant-service`)، ولا يصل للمتصفح.

---

## الجزء 6: التغييرات في الكود

### قاعدة البيانات (تعديل [schema-draft.sql](schema-draft.sql))

`google_ads_connections`: نحذف `refresh_token_encrypted` و`scopes` و`google_email` الإلزامي، ونضيف:

| الحقل | لماذا |
|---|---|
| `composio_connected_account_id` | رقم الاتصال في Composio |
| `composio_auth_config_id` | لنعرف على أي تطبيق تم الربط (مهم إذا غيرنا التطبيق لاحقًا) |
| `google_email` (اختياري) | للعرض فقط إن أمكن جلبه |
| `active_customer_id`, `login_customer_id` | كما هي |
| `status` | `connecting` / `connected` / `revoked` / `error` |

وجدول مشابه لـ Merchant Center (`merchant_connections`: `composio_connected_account_id`، `merchant_account_id`، `status`)، أو نفس الجدول بحقل `kind`.

### مسارات API جديدة (`src/app/api/google-ads/`)

| المسار | عمله |
|---|---|
| `POST connect/start` | يتحقق من الدور، يطلب رابط الربط من Composio، يعيده للواجهة |
| `GET oauth/callback` | **فقط** تحويل 302 ثابت إلى Composio (الجزء 3) |
| `GET connect/complete` | يتحقق من الخادم أن الاتصال `ACTIVE`، يحفظه، يعيد العميل لشاشة اختيار الحساب |
| `GET accounts` | قائمة الحسابات الإعلانية للاتصال |
| `POST accounts/select` | يحفظ الحساب المختار |
| `DELETE connection` | Revoke + delete |
| نفسها لـ Merchant | `merchant/connect/start`، `merchant/accounts`، `merchant/accounts/select`، `DELETE merchant/connection` |

### الواجهة

الواجهة الحالية ([ga-connect](../src/components/google-ads/ga-connect.tsx) و[ga-merchant](../src/components/google-ads/ga-merchant.tsx)) تبقى كما هي تقريبًا. نستبدل المحاكاة في [store.ts](../src/lib/google-ads/store.ts):

| الآن (محاكاة) | يصبح |
|---|---|
| `startConnect` + `completeAuth` | تحويل المتصفح إلى رابط `connect/start` ثم العودة من `connect/complete` |
| `chooseAccount` | `POST accounts/select` |
| `changeAccount` | `GET accounts` من جديد |
| `disconnect` | `DELETE connection` |
| `startMerchantConnect` ... `disconnectMerchant` | نفس الشيء على مسارات Merchant |

### متغيرات البيئة الجديدة

`COMPOSIO_API_KEY`، `COMPOSIO_GOOGLEADS_AUTH_CONFIG_ID`، `COMPOSIO_MERCHANT_AUTH_CONFIG_ID`. (Client ID وSecret الخاصان بـ Google يُوضعان في Composio فقط.)

### المكتبة

`@composio/core` (TypeScript). الدوال التي سنستخدمها: `connectedAccounts.initiate` أو `session.authorize` مع `callbackUrl`، و`connectedAccounts.list({ userIds, statuses: ['ACTIVE'] })`، و`revoke`، و`delete`، و`tools.execute` مع `connectedAccountId`.

---

## الجزء 7: الترتيب الزمني المقترح

| الأسبوع | ماذا |
|---|---|
| **الأسبوع 1** | خطوات Google 1–8 (مشروع، شاشة موافقة، سياسة خصوصية، تحقق العلامة، طلب Explorer). إرسال الأسئلة المفتوحة لـ Composio. الاشتراك في Composio Pro |
| **الأسبوع 1–2** | بناء الربط على حساب Google Ads **تجريبي** (مستوى Test): الجداول، المسارات، رابط التحويل، ربط الواجهة |
| **الأسبوع 2–3** | بعد Explorer: تجربة على حساب حقيقي واحد لنا. طلب التحقق من التطبيق (10 أيام عمل). تسجيل Merchant API |
| **الأسبوع 3–4** | طلب Basic بعد التحقق من العلامة. ربط Merchant Center |
| **بعد ذلك** | المرحلة 2: القراءة والتقارير. المرحلة 3: التعديلات بالموافقة |

نبدأ خطوات Google **فورًا** لأنها هي التي تأخذ الوقت، والمطورون أبلغوا في أكتوبر 2026 عن رفض سريع لبعض طلبات Explorer.

---

## أسئلة مفتوحة (يجب تأكيدها قبل البناء)

### لـ Composio
1. **Developer token:** توثيقهم يقول إن Auth Config الخاص بـ Google Ads فيه حقل developer token، بينما ألغته Google في 2026-09-09. هل الحقل ما زال إلزاميًا؟ وماذا نضع فيه؟
2. **حساب المدير (MCC):** أدواتهم لا تقبل `login_customer_id`. إذا اختار العميل حسابًا تحت MCC، كيف يرسلون رقم المدير لـ Google؟
3. **شروط الاستخدام:** تأكيد مكتوب أن استخدام Composio داخل منتجنا لخدمة عملائنا مسموح (البند 3 في شروطهم متناقض).
4. **الأسعار:** هل رصيد $29 يُخصم من العمليات الزائدة؟ هل العمليات الفاشلة تُحسب؟ هل تنفيذ أداة من خادمنا يُعد "Direct execution" (+$0.0001)؟ هل تمرير الـ callback عبر نطاقنا ضمن White-label الأساسي أم المتقدم ($0.30 لكل اتصال)؟
5. **Merchant Center:** هل أدواتهم مبنية على Merchant API v1؟ (صيغة `accounts/{account}` تدل على ذلك، لكن لم يُذكر صراحة.)
6. تقرير **SOC 2** وفترته، والملخص النهائي لحادثة مايو 2026.

### لـ Google
7. هل نطاق `content` (Merchant) يُعد حساسًا ويحتاج تحققًا مثل `adwords`؟
8. شرط **passkey** عند إنشاء صلاحية جديدة لـ Google Ads: ذكره بحثنا السابق من صفحة متطلبات الأمان، ولم نعد التحقق منه. إن كان صحيحًا فقد يتأخر ربط بعض العملاء حتى 7 أيام.
9. سؤال مكتوب لفريق Google Ads API Compliance: هل تصميمنا (وكيل داخل منتجنا، موافقة العميل على كل تغيير، تطبيقنا الخاص) مسموح، وهل نحتاج Secondary Interface Review؟

---

## ما تم اختباره فعليًا (2026-11-02)

- **Google Cloud:** مشروع `autommerce` (رقم 630607511282)، وفيه Google Ads API و Merchant API مفعّلان، وشاشة الموافقة (External, Testing)، وعميل OAuth "Autommerce Composio". طلب Explorer قُدّم.
- **Composio Auth Configs** (بياناتنا الخاصة، redirect v3، developer token فارغ):
  - `autommerce-googleads` → `ac_bhTLP2w5Pcxm` (scope `adwords`)
  - `autommerce-merchant` (scope `content`)
- **Google Ads:**
  - ✅ ربط حساب، وقراءة الحسابات (Kalema `204-636-2164` يعمل).
  - ✅ قراءة الحملات (الحساب فارغ).
  - ✅ `validate_only` لإنشاء ميزانية مقبول ولم يُنفّذ شيء.
- **Merchant:**
  - ✅ قراءة المنتجات (من حساب العميل Arzo Selucci `5354040410`).
  - التسجيل (developer registration) صار على حساب Merchant الخاص بنا **Autommerce `5898433148`** (المالك info@autommerce.com، والمدير infoawalseo@gmail.com)، بإيميل المطوّر info@autommerce.com.
  - كان التسجيل في البداية على حساب Arzo (حساب عميل)، ثم فُكّ بـ `unregisterGcp`.
- **النطاق:** autommerce.com مُثبت في Search Console بسجل TXT عند Hostinger. **لا تحذف هذا السجل.**
- **الموقع:** صفحتا /privacy و /terms منشورتان، وفيهما قسم Google وجملة Limited Use.
- **Branding:** مكتمل، ما عدا الشعار. ونطاق composio.dev ما زال في Authorized domains إلى أن نضع رابط التحويل.
- **جواب السؤالين 1 و 7:** حقل developer token غير مطلوب ونتركه فارغًا. نطاق `content` حساس وليس مقيدًا، فلا يحتاج CASA.

---

## المصادر

- Google: [Access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels) · [OAuth verification](https://support.google.com/cloud/answer/13463817) · [Merchant API registration](https://developers.google.com/merchant/api/guides/quickstart/registration) · [Developer Policies](https://support.google.com/adspolicy/answer/6169371)
- Composio: [Custom auth configs](https://docs.composio.dev/docs/auth-configuration/custom-auth-configs) · [Connected accounts](https://docs.composio.dev/docs/auth-configuration/connected-accounts) · [White-labeling](https://docs.composio.dev/docs/white-labeling-authentication) · [Sessions](https://docs.composio.dev/docs/configuring-sessions) · [Google Ads toolkit](https://docs.composio.dev/toolkits/googleads) · [Merchant toolkit](https://docs.composio.dev/toolkits/google_merchant) · [Pricing](https://composio.dev/pricing)
