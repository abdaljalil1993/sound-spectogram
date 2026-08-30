# Wave 13 Spec: Render Module Extraction

هذا الملف يوثّق بالضبط ما سيتم فعله في موجة 13 الخاصة باستخراج مسار الرندر من الملف المركزي. الهدف ليس شرحاً عاماً، بل عقد تنفيذ واضح يمكن الرجوع إليه إذا ظهر أي regression بعد النقل.

## الهدف

نقل مسار الرندر المركزي من [src/public/js/dashboard.js](../../src/public/js/dashboard.js) إلى ملف جديد متوقع اسمه [src/public/js/dashboard/render.js](../../src/public/js/dashboard/render.js) مع الحفاظ على السلوك الحالي 100% دون أي تغيير وظيفي مقصود.

المقصود بمسار الرندر المركزي هنا هو فقط:

1. `renderLatestPacket(options)`
2. `scheduleRender(options)`
3. `markInteractionActive()`
4. `clearSpectrogramCanvas(message)`

أي شيء خارج هذه المجموعة لا يُنقل في هذه الموجة إلا إذا كان تبعيّة مباشرة لا يمكن فصلها دون كسر البناء أو السلوك.

## لماذا هذه أخطر موجة

هذه الموجة هي الأعلى خطورة لأن هذا المسار:

1. يقرأ عدداً كبيراً من حقول `state` في مكان واحد.
2. يكتب حقولاً مركزية مثل `state.lastRenderMeta` و `state.renderedTimeMarkerHits` و `state.currentPackets` وحقول `viewport`.
3. يُستدعى بشكل غير مباشر من عدة وحدات مستخرجة سابقاً: `socket.js`, `history-api.js`, `viewport.js`, `settings.js`, `time-markers.js`, `canvas-interaction.js`.
4. يزوّد وحدات downstream ببيانات أساسية تعتمد عليها التفاعلات اللاحقة، خصوصاً `probe.js`, `time-markers.js`, `canvas-interaction.js`.

أي خطأ هنا قد يظهر كعطل في البث الحي أو الـ zoom/pan أو probe أو markers، رغم أن السبب الحقيقي يكون في عقدة الرندر نفسها.

## الفرضية التنفيذية

الفرضية المحلية التي سنختبرها هي:

يمكن استخراج هذا المسار إلى `render.js` بأمان إذا بقيت جميع الكتابات والقراءات المركزية كما هي حرفياً، وتم حقن مراجع DOM والدوال الخارجية عبر `initRender(deps)` بدلاً من الاعتماد على المتغيرات المحلية داخل `dashboard.js`.

## الاختبار الأرخص الذي قد يفند الفرضية

أرخص فحص كاشف بعد أول تعديل هو:

1. نجاح `npm run build` دون أخطاء TypeScript أو bundling.
2. نجاح بحث موجّه يثبت أن `scheduleRender` و `markInteractionActive` لم يعودا معرفين محلياً في `dashboard.js` مع بقاء جميع call sites مرتبطة بالنسخة المستخرجة.
3. بقاء `lastRenderMeta` و `renderedTimeMarkerHits` مكتوبين في نفس المواضع المنطقية فقط.

إذا فشل هذا الفحص، فإما أن التبعية غير مكتملة، أو أن هناك split ownership بين `dashboard.js` و `render.js`.

## نطاق النقل في هذه الموجة

سيتم تنفيذ الموجة بهذا الترتيب فقط:

1. إنشاء `render.js` وتصدير `initRender(deps)`, `renderLatestPacket`, `scheduleRender`, `markInteractionActive`, `clearSpectrogramCanvas`.
2. نقل جسم الدوال الأربع كما هو قدر الإمكان مع أقل تعديل ممكن يقتصر على:
   - تحويل الاعتماد على المتغيرات المحلية إلى deps محقونة.
   - استيراد الدوال المستخدمة من وحداتها المستخرجة مسبقاً.
   - إبقاء القراءة والكتابة على `state` بنفس الترتيب الحالي.
3. تحديث `dashboard.js` ليستورد `initRender` والدوال العامة اللازمة منه.
4. تمرير مراجع DOM والدوال اللازمة إلى `initRender` من كتلة التهيئة الرئيسية.
5. إزالة التعريفات المحلية المنقولة من `dashboard.js` فقط بعد اكتمال التوصيل.
6. تشغيل build مباشرة بعد أول patch فعال.
7. إجراء audit نهائي على call sites ومواضع الكتابة الحساسة.

## الاعتماديات المباشرة المعروفة قبل النقل

الدوال المنقولة تعتمد حالياً على العناصر التالية، ويجب الحفاظ عليها دون إعادة تفسير:

1. `state`
2. `updateFollowLiveButtonState`
3. `setProcessingStatus`
4. `markLiveTrace`
5. `parseDisplayFrequencyRange`
6. `syncLatestLiveViewport`
7. `drawTimeMarkersOverlay`
8. `getVisiblePackets`
9. `getPacketEndMs`
10. `getPacketStartMs`
11. `getPacketFrequencyBins`
12. `parseFlexibleTimeMs`
13. `formatNaiveDateTimeMs`
14. `formatLocalDateTime`
15. DOM refs: `followLiveBtn`, `probeTooltipEl`, `historyInfoEl`, `historyTableBody`, `gapTooltipEl`, `canvas`, `legendCanvas`, `processingStatusEl`

إذا ظهر اعتماد إضافي أثناء النقل، يجب توثيقه في هذا الملف ضمن قسم "الانحرافات المكتشفة أثناء التنفيذ" قبل توسيع النطاق.

## ثوابت عدم كسر السلوك

هذه الشروط غير قابلة للتفاوض في هذه الموجة:

1. لا تغيير في signature العامة لـ `scheduleRender(options)`.
2. لا تغيير في semantics الخاصة بـ `skipTable`.
3. لا تغيير في توقيت `requestAnimationFrame` أو منطق تجميع `pendingRenderOptions`.
4. لا تغيير في ترتيب:
   - حساب نافذة العرض
   - استدعاء `window.Spectrogram.renderSpectrogram(...)`
   - كتابة `state.lastRenderMeta`
   - استدعاء `drawTimeMarkersOverlay()`
   - تحديث `historyInfoEl`
   - تعبئة `historyTableBody`
5. لا تغيير في منطق live-follow أو manual browse.
6. لا نقل لأي منطق من `probe.js` أو `time-markers.js` إلى `render.js`.
7. لا إنشاء ownership مزدوج لأي من المتغيرات التالية:
   - `renderRafId`
   - `pendingRenderOptions`
   - `interactionEndTimer`
   - `state.lastRenderMeta`

## ما لن نفعله في هذه الموجة

1. لن نعيد تصميم API جديدة للرندر.
2. لن نحول المسار إلى class أو object stateful جديد.
3. لن نغيّر النصوص أو الرسائل أو منطق الجدول أو منطق الفلاتر.
4. لن ندمج هذه الموجة مع تنظيفات جانبية أو refactors تجميلية.

## التحقق المطلوب بعد التنفيذ

بعد النقل يجب تنفيذ هذه الفحوص:

1. `npm run build`
2. بحث في `dashboard.js` عن:
   - `function renderLatestPacket`
   - `function scheduleRender`
   - `function markInteractionActive`
   - `function clearSpectrogramCanvas`
   للتأكد من اختفائها من الملف الأصلي.
3. بحث في المشروع عن `scheduleRender(` للتأكد من أن call sites ما زالت موجودة ولم تُكسر.
4. بحث في المشروع عن `state.lastRenderMeta` و `state.renderedTimeMarkerHits` لتأكيد بقاء ownership منطقياً ومن دون split جديد.

## الانحرافات المكتشفة أثناء التنفيذ

لا يوجد حتى الآن.

## ما نُفذ فعلياً

تم تنفيذ الموجة وفق الخطة أعلاه بالترتيب التالي:

1. إنشاء [src/public/js/dashboard/render.js](../../src/public/js/dashboard/render.js).
2. نقل الدوال التالية إليه مع الحفاظ على منطقها الحالي:
   - `renderLatestPacket(options)`
   - `scheduleRender(options)`
   - `markInteractionActive()`
   - `clearSpectrogramCanvas(message)`
3. نقل local ownership التالية من `dashboard.js` إلى `render.js`:
   - `_renderRafId`
   - `_pendingRenderOptions`
   - `_interactionEndTimer`
4. إضافة `initRender(deps)` لحقن مراجع DOM اللازمة للرندر.
5. تحديث [src/public/js/dashboard.js](../../src/public/js/dashboard.js) ليستورد:
   - `initRender`
   - `scheduleRender`
   - `markInteractionActive`
6. إزالة التعريفات المحلية المنقولة من `dashboard.js` بعد اكتمال التوصيل.
7. إبقاء جميع call sites السابقة لـ `scheduleRender` كما هي من حيث التوقيع والسلوك.

## الملفات التي تغيّرت في هذه الموجة

1. [docs/specs/wave-13-render-extraction.md](../../docs/specs/wave-13-render-extraction.md)
2. [src/public/js/dashboard/render.js](../../src/public/js/dashboard/render.js)
3. [src/public/js/dashboard.js](../../src/public/js/dashboard.js)

## نتائج التحقق الفعلية

تم التحقق من التالي بعد التنفيذ:

1. `npm run build` نجح دون أخطاء.
2. لم يعد `dashboard.js` يحتوي على:
   - `function renderLatestPacket`
   - `function scheduleRender`
   - `function markInteractionActive`
   - `function clearSpectrogramCanvas`
3. بقيت call sites الخاصة بـ `scheduleRender(` موجودة في الوحدات المستخرجة كما هو متوقع.
4. بقيت `state.lastRenderMeta` و `state.renderedTimeMarkerHits` مستخدمتين downstream في الوحدات التي تعتمد عليهما، من دون إعادة ownership محلية في `dashboard.js`.
