"""Run with the isolated environment: python server/floorplan/python/test_scale.py."""
import unittest
import cv2
import numpy as np
from convert import automatic_scale, ScaleError


class ScaleTests(unittest.TestCase):
    def test_real_ocr_on_two_enclosed_rooms(self):
        # Each room is 12 x 10 feet at 24 pixels/foot. Thick borders cause a
        # small, expected interior-vs-centerline bias, bounded below.
        image = np.full((400,800,3),255,np.uint8)
        barrier = np.zeros((400,800),np.uint8)
        for left in (30,430):
            cv2.rectangle(image,(left,40),(left+288,280),(0,0,0),3)
            cv2.rectangle(barrier,(left,40),(left+288,280),255,3)
            cv2.putText(image, "12'0\" x 10'0\"", (left+20,165), cv2.FONT_HERSHEY_SIMPLEX,.65,(0,0,0),1,cv2.LINE_AA)
        scale = automatic_scale(image,barrier,1,cv2,np)
        self.assertLess(abs(scale-2)/2,.05)

    def test_blank_plan_cannot_invent_a_scale(self):
        with self.assertRaises(ScaleError):
            automatic_scale(np.full((300,400,3),255,np.uint8),np.zeros((300,400),np.uint8),1,cv2,np)


if __name__ == "__main__":
    unittest.main()
