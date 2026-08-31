# Backend Spec: TypeORM Migrations Setup (Branch: test)

## Scope

تهيئة الباك-إند لاستخدام Migrations مع TypeORM CLI بدون أي تعديل على ملفات الواجهة أو ملفات تقسيم الداشبورد.

خارج النطاق بشكل صريح:

1. أي ملف تحت src/public/js/dashboard/
2. ملف src/public/js/dashboard.js
3. أي تغيير وظيفي في مسار السوكِت/الرندر

## Requested Changes

1. تثبيت ts-node كـ devDependency لأن TypeORM CLI يحتاجه مع TypeScript DataSource.
2. تعديل DataSource لإيقاف synchronize وتفعيل migrations.
3. إنشاء مجلد src/migrations/ فارغ ليتم توليد أول migration يدويًا لاحقًا.
4. إضافة سكربتات TypeORM migration commands في package.json.
5. التحقق من شمول tsconfig لمسار src/migrations/*.ts.
6. إعادة توليد lockfile عبر npm install ثم التحقق من نجاح npm run build.

## Applied Configuration

### src/config/data-source.ts

تم تطبيق ما يلي فقط:

1. synchronize: false
2. migrations: [__dirname + "/../migrations/*.{js,ts}"]
3. migrationsRun: true

وباقي خصائص الاتصال والكيانات بقيت كما هي.

### package.json scripts

تمت إضافة:

1. typeorm
2. migration:generate
3. migration:create
4. migration:run
5. migration:revert
6. migration:show

## Verification Notes

1. tsconfig include الحالي هو src/**/*.ts وبالتالي يشمل src/migrations/*.ts ضمنيًا، لذلك لا يلزم تعديل tsconfig.
2. سيتم تنفيذ npm install لتحديث package-lock.json بعد إضافة ts-node.
3. سيتم تنفيذ npm run build للتحقق من عدم وجود regressions.

## Expected Operator Commands

بعد الإعداد يمكنك استخدام:

1. npm run migration:create -- src/migrations/InitSchema
2. npm run migration:generate -- src/migrations/InitSchema
3. npm run migration:run
4. npm run migration:revert
5. npm run migration:show
