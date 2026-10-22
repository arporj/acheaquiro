import {
  AirVent, Anvil, Armchair, Baby, Bath, BatteryCharging, BedDouble, Beef, Beer, Music, BookOpen, Bone, BrickWall, Brush,
  BrushCleaning, Bug, CakeSlice, Camera, Car, Carrot, Cat, ChefHat, Cog, Construction, Croissant, CupSoda, Dog,
  Drill, Droplets, Dumbbell, Flower2, Footprints, Frame, Glasses, GraduationCap, Hammer, Hand, HandHeart, HardHat,
  Headphones, Heart, HeartHandshake, House, KeyRound, Languages, Laptop, Layers, LifeBuoy, MapPin, MoonStar,
  PaintBucket, PaintRoller, Palette, Paperclip, PartyPopper, PawPrint, PenTool, Pill, Pizza, Printer, Recycle, Ruler,
  Sandwich, Scale, School, Scissors, ScissorsLineDashed, SearchX, Shirt, ShoppingBag, ShoppingCart, ShowerHead,
  FaceSlightlySmiling, Sofa, Soup, Sparkles, SprayCan, Sprout, Stethoscope, Tag, Truck, UtensilsCrossed,
  WashingMachine, WavesLadder, Wheat, Wrench, Zap,
} from "@lucide/astro";

// Importação explícita: só estes ícones entram no pacote final do site.
export const iconesCategoria = {
  "air-vent": AirVent, anvil: Anvil, armchair: Armchair, baby: Baby, bath: Bath, "battery-charging": BatteryCharging,
  "bed-double": BedDouble, beef: Beef, beer: Beer, music: Music, "book-open": BookOpen, bone: Bone, "brick-wall": BrickWall, brush: Brush,
  "brush-cleaning": BrushCleaning, bug: Bug, "cake-slice": CakeSlice, camera: Camera, car: Car, carrot: Carrot, cat: Cat,
  "chef-hat": ChefHat, cog: Cog, construction: Construction, croissant: Croissant, "cup-soda": CupSoda, dog: Dog,
  drill: Drill, droplets: Droplets, dumbbell: Dumbbell, "flower-2": Flower2, footprints: Footprints, frame: Frame,
  glasses: Glasses, "graduation-cap": GraduationCap, hammer: Hammer, hand: Hand, "hand-heart": HandHeart,
  "hard-hat": HardHat, headphones: Headphones, heart: Heart, "heart-handshake": HeartHandshake, house: House,
  "key-round": KeyRound, languages: Languages, laptop: Laptop, layers: Layers, "life-buoy": LifeBuoy, "map-pin": MapPin,
  "moon-star": MoonStar, "paint-bucket": PaintBucket, "paint-roller": PaintRoller, palette: Palette,
  paperclip: Paperclip, "party-popper": PartyPopper, "paw-print": PawPrint, "pen-tool": PenTool, pill: Pill,
  pizza: Pizza, printer: Printer, recycle: Recycle, ruler: Ruler, sandwich: Sandwich, scale: Scale, school: School,
  scissors: Scissors, "scissors-line-dashed": ScissorsLineDashed, "search-x": SearchX, shirt: Shirt,
  "shopping-bag": ShoppingBag, "shopping-cart": ShoppingCart, "shower-head": ShowerHead, smile: FaceSlightlySmiling, sofa: Sofa,
  soup: Soup, sparkles: Sparkles, "spray-can": SprayCan, sprout: Sprout, stethoscope: Stethoscope, tag: Tag,
  truck: Truck, "utensils-crossed": UtensilsCrossed, "washing-machine": WashingMachine, "waves-ladder": WavesLadder,
  wheat: Wheat, wrench: Wrench, zap: Zap,
};

export type NomeIconeCategoria = keyof typeof iconesCategoria;
