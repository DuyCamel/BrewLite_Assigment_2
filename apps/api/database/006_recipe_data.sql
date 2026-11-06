-- Recipe catalog supplied by the project team.
-- Quantities below are for size S. M is 125% and L is 150%, rounded up.
-- Ingredient stock starts at 5,000 units in its declared unit.
DO $$
DECLARE
  product_recipe JSONB := $recipes$
  [
    {"id":"ca-phe-sua","items":{"ca-phe-phin":{"name":"Cà phê phin","unit":"ml","qty":60},"sua-dac":{"name":"Sữa đặc","unit":"ml","qty":25},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"bac-xiu","items":{"ca-phe-phin":{"name":"Cà phê phin","unit":"ml","qty":30},"sua-dac":{"name":"Sữa đặc","unit":"ml","qty":25},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":80},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"americano","items":{"espresso":{"name":"Espresso","unit":"ml","qty":60},"nuoc-loc":{"name":"Nước lọc","unit":"ml","qty":100},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"latte","items":{"espresso":{"name":"Espresso","unit":"ml","qty":30},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":150},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"tra-dao","items":{"tra-den":{"name":"Trà đen","unit":"ml","qty":100},"siro-dao":{"name":"Siro đào","unit":"ml","qty":20},"dao-ngam":{"name":"Đào ngâm","unit":"gram","qty":40},"cam-tuoi":{"name":"Cam tươi","unit":"gram","qty":20},"nuoc-sa":{"name":"Nước sả","unit":"ml","qty":20},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"tra-vai","items":{"tra-lai":{"name":"Trà lài","unit":"ml","qty":120},"siro-vai":{"name":"Siro vải","unit":"ml","qty":20},"vai-ngam":{"name":"Vải ngâm","unit":"gram","qty":40},"nuoc-cot-chanh":{"name":"Nước cốt chanh","unit":"ml","qty":5},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"matcha-latte","items":{"bot-matcha":{"name":"Bột matcha","unit":"gram","qty":3},"nuoc-nong":{"name":"Nước nóng","unit":"ml","qty":30},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":120},"siro-duong":{"name":"Siro đường","unit":"ml","qty":15},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"chocolate","items":{"bot-cacao":{"name":"Bột cacao","unit":"gram","qty":10},"nuoc-nong":{"name":"Nước nóng","unit":"ml","qty":30},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":120},"sua-dac":{"name":"Sữa đặc","unit":"ml","qty":20},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"espresso","items":{"espresso":{"name":"Espresso","unit":"ml","qty":30}}},
    {"id":"cappuccino","items":{"espresso":{"name":"Espresso","unit":"ml","qty":30},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":120}}},
    {"id":"ca-phe-den","items":{"ca-phe-phin":{"name":"Cà phê phin","unit":"ml","qty":60},"siro-duong":{"name":"Siro đường","unit":"ml","qty":15},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"cold-brew","items":{"cold-brew":{"name":"Cà phê cold brew","unit":"ml","qty":150},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"caramel-latte","items":{"espresso":{"name":"Espresso","unit":"ml","qty":30},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":130},"siro-caramel":{"name":"Siro caramel","unit":"ml","qty":20},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"vanilla-latte","items":{"espresso":{"name":"Espresso","unit":"ml","qty":30},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":130},"siro-vanilla":{"name":"Siro vanilla","unit":"ml","qty":20},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"mocha","items":{"espresso":{"name":"Espresso","unit":"ml","qty":30},"bot-cacao":{"name":"Bột cacao","unit":"gram","qty":8},"nuoc-nong":{"name":"Nước nóng","unit":"ml","qty":20},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":100},"sua-dac":{"name":"Sữa đặc","unit":"ml","qty":20},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"ca-phe-dua","items":{"ca-phe-phin":{"name":"Cà phê phin","unit":"ml","qty":50},"nuoc-cot-dua":{"name":"Nước cốt dừa","unit":"ml","qty":50},"sua-dac":{"name":"Sữa đặc","unit":"ml","qty":25},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":30},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"tra-chanh","items":{"tra-lai":{"name":"Trà lài","unit":"ml","qty":120},"nuoc-cot-chanh":{"name":"Nước cốt chanh","unit":"ml","qty":15},"siro-duong":{"name":"Siro đường","unit":"ml","qty":25},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"tra-tac","items":{"tra-lai":{"name":"Trà lài","unit":"ml","qty":120},"nuoc-cot-tac":{"name":"Nước cốt tắc","unit":"ml","qty":20},"siro-duong":{"name":"Siro đường","unit":"ml","qty":25},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"tra-dau","items":{"tra-lai":{"name":"Trà lài","unit":"ml","qty":120},"mut-dau":{"name":"Mứt dâu pha chế","unit":"gram","qty":25},"dau-tuoi":{"name":"Dâu tươi","unit":"gram","qty":30},"nuoc-cot-chanh":{"name":"Nước cốt chanh","unit":"ml","qty":5},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"tra-xoai","items":{"tra-lai":{"name":"Trà lài","unit":"ml","qty":120},"xoai-xay":{"name":"Xoài xay nhuyễn","unit":"gram","qty":50},"siro-duong":{"name":"Siro đường","unit":"ml","qty":15},"nuoc-cot-chanh":{"name":"Nước cốt chanh","unit":"ml","qty":5},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"tra-chanh-day","items":{"tra-lai":{"name":"Trà lài","unit":"ml","qty":120},"ruot-chanh-day":{"name":"Ruột chanh dây","unit":"gram","qty":30},"siro-duong":{"name":"Siro đường","unit":"ml","qty":25},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"tra-oi-hong","items":{"tra-lai":{"name":"Trà lài","unit":"ml","qty":100},"nuoc-ep-oi-hong":{"name":"Nước ép ổi hồng","unit":"ml","qty":60},"siro-duong":{"name":"Siro đường","unit":"ml","qty":15},"nuoc-cot-chanh":{"name":"Nước cốt chanh","unit":"ml","qty":5},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"tra-sen","items":{"tra-uop-sen":{"name":"Trà ướp sen","unit":"ml","qty":140},"siro-duong":{"name":"Siro đường","unit":"ml","qty":20},"hat-sen":{"name":"Hạt sen chín","unit":"gram","qty":30},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"tra-luu","items":{"tra-lai":{"name":"Trà lài","unit":"ml","qty":100},"nuoc-ep-luu":{"name":"Nước ép lựu","unit":"ml","qty":60},"siro-duong":{"name":"Siro đường","unit":"ml","qty":15},"nuoc-cot-chanh":{"name":"Nước cốt chanh","unit":"ml","qty":5},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"matcha-da","items":{"bot-matcha":{"name":"Bột matcha","unit":"gram","qty":3},"nuoc-nong":{"name":"Nước nóng","unit":"ml","qty":40},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":80},"sua-dac":{"name":"Sữa đặc","unit":"ml","qty":20},"da":{"name":"Đá","unit":"gram","qty":180}}},
    {"id":"matcha-espresso","items":{"bot-matcha":{"name":"Bột matcha","unit":"gram","qty":3},"nuoc-nong":{"name":"Nước nóng","unit":"ml","qty":30},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":100},"espresso":{"name":"Espresso","unit":"ml","qty":30},"siro-duong":{"name":"Siro đường","unit":"ml","qty":15},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"cacao-nong","items":{"bot-cacao":{"name":"Bột cacao","unit":"gram","qty":10},"nuoc-nong":{"name":"Nước nóng","unit":"ml","qty":40},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":150},"sua-dac":{"name":"Sữa đặc","unit":"ml","qty":20}}},
    {"id":"sua-tuoi","items":{"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":180},"siro-duong":{"name":"Siro đường","unit":"ml","qty":15},"da":{"name":"Đá","unit":"gram","qty":100}}},
    {"id":"sua-tuoi-tran-chau","items":{"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":150},"tran-chau-chin":{"name":"Trân châu chín","unit":"gram","qty":50},"siro-duong-den":{"name":"Siro đường đen","unit":"ml","qty":20},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"soda-chanh","items":{"soda-khong-duong":{"name":"Soda không đường","unit":"ml","qty":150},"nuoc-cot-chanh":{"name":"Nước cốt chanh","unit":"ml","qty":20},"siro-duong":{"name":"Siro đường","unit":"ml","qty":25},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"soda-viet-quat","items":{"soda-khong-duong":{"name":"Soda không đường","unit":"ml","qty":150},"siro-viet-quat":{"name":"Siro việt quất","unit":"ml","qty":25},"nuoc-cot-chanh":{"name":"Nước cốt chanh","unit":"ml","qty":10},"da":{"name":"Đá","unit":"gram","qty":150}}},
    {"id":"nuoc-cam","items":{"nuoc-cam-ep":{"name":"Nước cam ép nguyên chất","unit":"ml","qty":180},"siro-duong":{"name":"Siro đường","unit":"ml","qty":10},"da":{"name":"Đá","unit":"gram","qty":100}}},
    {"id":"nuoc-dua","items":{"nuoc-dua-tuoi":{"name":"Nước dừa tươi","unit":"ml","qty":200},"com-dua-non":{"name":"Cơm dừa non","unit":"gram","qty":30},"da":{"name":"Đá","unit":"gram","qty":100}}},
    {"id":"yogurt-dau","items":{"sua-chua-co-duong":{"name":"Sữa chua có đường","unit":"gram","qty":100},"mut-dau":{"name":"Mứt dâu pha chế","unit":"gram","qty":25},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":50},"sua-dac":{"name":"Sữa đặc","unit":"ml","qty":10},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"yogurt-xoai","items":{"sua-chua-co-duong":{"name":"Sữa chua có đường","unit":"gram","qty":100},"xoai-xay":{"name":"Xoài xay nhuyễn","unit":"gram","qty":50},"sua-tuoi-khong-duong":{"name":"Sữa tươi không đường","unit":"ml","qty":50},"sua-dac":{"name":"Sữa đặc","unit":"ml","qty":10},"da":{"name":"Đá","unit":"gram","qty":120}}},
    {"id":"nuoc-suoi","items":{"nuoc-suoi-chai":{"name":"Nước suối chai 500 ml","unit":"ml","qty":500}}}
  ]$recipes$::jsonb;
  topping_recipe JSONB := '[
    {"id":"pearl","name":"Trân châu","ingredient":"tran-chau-chin","ingredient_name":"Trân châu chín","unit":"gram","qty":50},
    {"id":"cream","name":"Kem sữa","ingredient":"kem-sua","ingredient_name":"Kem sữa","unit":"gram","qty":30}
  ]'::jsonb;
  product_row JSONB; item JSONB; topping JSONB;
  recipe_ingredient_id TEXT; size_name TEXT; scaled_quantity INTEGER;
BEGIN
  DELETE FROM product_recipes WHERE ingredient_id LIKE 'legacy-product-%';
  DELETE FROM topping_recipes WHERE ingredient_id LIKE 'legacy-topping-%';
  DELETE FROM ingredients
  WHERE id LIKE 'legacy-product-%' OR id LIKE 'legacy-topping-%';

  FOR product_row IN SELECT * FROM jsonb_array_elements(product_recipe) LOOP
    FOR recipe_ingredient_id, item IN SELECT key, value FROM jsonb_each(product_row->'items') LOOP
      INSERT INTO ingredients(id, name, unit, stock)
      VALUES (recipe_ingredient_id, item->>'name', item->>'unit', 5000)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, unit = EXCLUDED.unit;

      FOREACH size_name IN ARRAY ARRAY['S','M','L'] LOOP
        scaled_quantity := CASE size_name
          WHEN 'S' THEN (item->>'qty')::INTEGER
          WHEN 'M' THEN CEIL((item->>'qty')::NUMERIC * 1.25)::INTEGER
          ELSE CEIL((item->>'qty')::NUMERIC * 1.50)::INTEGER
        END;
        INSERT INTO product_recipes(product_id, size, ingredient_id, quantity)
        VALUES (product_row->>'id', size_name, recipe_ingredient_id, scaled_quantity)
        ON CONFLICT (product_id, size, ingredient_id)
        DO UPDATE SET quantity = EXCLUDED.quantity;
      END LOOP;
    END LOOP;
  END LOOP;

  FOR topping IN SELECT * FROM jsonb_array_elements(topping_recipe) LOOP
    INSERT INTO ingredients(id, name, unit, stock)
    VALUES (topping->>'ingredient', topping->>'ingredient_name', topping->>'unit', 5000)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, unit = EXCLUDED.unit;

    INSERT INTO topping_recipes(product_id, topping_id, ingredient_id, quantity)
    SELECT p.id, topping->>'id', topping->>'ingredient', (topping->>'qty')::INTEGER
    FROM products p
    WHERE p.toppings @> jsonb_build_array(jsonb_build_object('id', topping->>'id'))
    ON CONFLICT (product_id, topping_id, ingredient_id)
    DO UPDATE SET quantity = EXCLUDED.quantity;
  END LOOP;
END $$;
