-- Reference data required in every environment (not demo data).
insert into storage.buckets(id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;

insert into income_categories(code, name, sort_order) values
 ('room','Room Booking Revenue',1),('fnb','Food and Beverage',2),('restaurant','Restaurant Revenue',3),('laundry','Laundry',4),
 ('early_checkin','Early Check-in',5),('late_checkout','Late Checkout',6),('extra_guest','Extra Guest',7),
 ('activities','Activities and Experiences',8),('transport','Transport',9),('events','Event Revenue',10),('misc','Miscellaneous Income',11)
on conflict (code) do nothing;

insert into expense_categories(group_name, name, sort_order, default_deductible) values
 ('Property','Ration',1,true),('Property','Vegetables',2,true),('Property','Fruits',3,true),('Property','Milk',4,true),('Property','Dairy',5,true),
 ('Property','Food supplies',6,true),('Property','Electricity',7,true),('Property','Water',8,true),('Property','Gas',9,true),('Property','Internet',10,true),
 ('Property','Cleaning supplies',11,true),('Property','Toiletries',12,true),('Property','Guest amenities',13,true),('Property','Laundry',14,true),('Property','Housekeeping',15,true),
 ('Staff','Salaries',20,true),('Staff','Staff meals',21,true),('Staff','Staff accommodation',22,true),('Staff','Incentives',23,true),('Staff','Temporary labour',24,true),
 ('Maintenance','Plumbing',30,true),('Maintenance','Electrical',31,true),('Maintenance','Furniture',32,true),('Maintenance','Appliances',33,true),('Maintenance','Painting',34,true),
 ('Maintenance','Civil work',35,true),('Maintenance','AC servicing',36,true),('Maintenance','Pest control',37,true),('Maintenance','Garden',38,true),('Maintenance','Swimming pool',39,true),
 ('Other','OTA commission',40,true),('Other','Marketing',41,true),('Other','Advertising',42,true),('Other','Transport',43,true),('Other','Software',44,true),
 ('Other','Licenses',45,true),('Other','Insurance',46,true),('Other','Professional fees',47,true),('Other','Miscellaneous',48,true)
on conflict (name) do nothing;

insert into app_settings(key, value) values
 ('company', '{"name":"STAYRA Hospitality","legal_name":"STAYRA Hospitality Pvt. Ltd.","gstin":"","address":"","email":"accounts@stayra.in","phone":""}'),
 ('demand.occupancy_threshold', '0.85'),
 ('alerts.vacancy_days', '5'),
 ('currency', '"INR"'),
 ('timezone', '"Asia/Kolkata"')
on conflict (key) do nothing;
