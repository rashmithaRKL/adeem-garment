-- 0004_seed.sql - five production lines and representative orders.
-- Line 05 exists from day one even if the floor is running four today.
insert into production_lines (line_number, line_name, department, status, active) values
  (1, 'LINE 01', 'Sewing A',  'running',    true),
  (2, 'LINE 02', 'Sewing B',  'running',    true),
  (3, 'LINE 03', 'Sewing C',  'behind',     true),
  (4, 'LINE 04', 'Finishing', 'running',    true),
  (5, 'LINE 05', 'Sewing D',  'changeover', true)
on conflict (line_number) do nothing;

insert into orders (order_number, buyer, style_number, product_name, color, size,
                    order_quantity, target_quantity, delivery_date,
                    production_status, delivery_status, production_line_id)
select v.order_number, v.buyer, v.style_number, v.product_name, v.color, v.size,
       v.order_quantity, v.target_quantity, v.delivery_date::date,
       v.production_status::prod_status, v.delivery_status::delivery_status, l.id
from (values
  ('GA-2418','Northgate Apparel','NG-4402','Crew Tee','White','S-XXL',62000,1450,'2026-08-22','in_production','on_time',1),
  ('GA-2431','Brava Nordic','BR-118','Fleece Hoodie','Charcoal','S-XL',35000,1250,'2026-08-29','in_production','on_time',2),
  ('GA-2402','Ellery Basics','EL-77','Rib Tank','Black','XS-L',48000,1600,'2026-08-18','at_risk','delayed',3),
  ('GA-2440','Halstead Uniform','HU-330','Work Shirt','Navy','M-XXL',41500,1350,'2026-09-02','in_production','upcoming',4),
  ('GA-2447','Maroon & Co','MC-905','Chino Short','Sand','30-38',28000,1200,'2026-09-09','pending','upcoming',5)
) as v(order_number,buyer,style_number,product_name,color,size,order_quantity,target_quantity,
       delivery_date,production_status,delivery_status,line_no)
join production_lines l on l.line_number = v.line_no
on conflict (order_number) do nothing;

-- Promote your own account to admin once, by hand, after signing up:
--   update profiles set role = 'admin' where email = 'you@example.com';
