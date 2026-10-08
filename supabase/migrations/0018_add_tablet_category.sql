-- Tablet as a first-class category (iPads, Galaxy Tabs, etc.), not folded
-- into Other. Run this as its own statement so the new enum value is
-- committed before anything uses it.

alter type device_category add value 'tablet';
